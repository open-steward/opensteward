/**
 * eGestor webhook handling.
 *
 * eGestor supports registering webhook URLs via POST /api/v1/webhooks, but
 * its public API documentation does not specify a payload signature scheme.
 * Verification is therefore a no-op (always returns true when no secret is
 * configured, or skips signature comparison).
 *
 * Payload shape: eGestor event payloads are not officially documented at
 * time of writing. We do a best-effort parse using common field patterns
 * observed in similar Brazilian ERP APIs.
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── eGestor payload types (best-effort) ──────────────────────────────────────

type EgestorWebhookPayload = {
  evento?: string     // e.g. "venda.criada", "contato.atualizado"
  recurso?: string    // e.g. "vendas", "contatos"
  acao?: string       // e.g. "criada", "atualizada", "removida"
  id?: string | number
  codigo?: string | number
  dados?: Record<string, unknown>
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(recurso?: string, evento?: string): WebhookResourceType {
  const src = (recurso ?? evento ?? '').toLowerCase()
  if (src.includes('venda')) return 'invoice'
  if (src.includes('compra')) return 'bill'
  if (src.includes('contato') || src.includes('cliente') || src.includes('fornecedor')) return 'contact'
  if (src.includes('plano') || src.includes('conta')) return 'account'
  if (src.includes('devolucao') || src.includes('devolução')) return 'creditmemo'
  if (src.includes('recebimento')) return 'transaction'
  if (src.includes('pagamento')) return 'transaction'
  return 'unknown'
}

function mapAction(acao?: string, evento?: string): WebhookAction {
  const src = (acao ?? evento ?? '').toLowerCase()
  if (src.includes('cri') || src.includes('cad')) return 'created'
  if (src.includes('atu') || src.includes('upd') || src.includes('alt')) return 'updated'
  if (src.includes('del') || src.includes('rem') || src.includes('excl')) return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const egestorWebhook: WebhookHandler = {
  /**
   * eGestor does not publish a payload signing mechanism.
   * Always returns true (no signature to verify).
   */
  verifyWebhook(_payload, _headers, _secret) {
    return true
  },

  parseWebhookEvents(payload) {
    const body = payload as EgestorWebhookPayload

    const resourceType = mapResourceType(body.recurso, body.evento)
    const action = mapAction(body.acao, body.evento)
    const resourceId = body.id ?? body.codigo

    const event: WebhookEvent = {
      platform: 'egestor',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId: resourceId !== undefined ? String(resourceId) : '',
      payload,
    }

    return [event]
  },
}
