/**
 * FreshBooks webhook verification and parsing.
 *
 * Verification: HMAC-SHA256 of raw body using the FreshBooks client secret.
 * Signature arrives hex-encoded in the `x-freshbooks-hmac-sha256` header.
 *
 * Docs: https://www.freshbooks.com/api/webhooks
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { verifyHmacSha256 } from '../../webhook'

// ── FreshBooks payload types ──────────────────────────────────────────────────

type FreshBooksWebhookPayload = {
  object_id?: string | number
  object_type?: string          // e.g. "invoice", "payment", "client"
  event?: string                // e.g. "invoice.create", "payment.update"
  account_id?: string
  system?: string
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(objectType: string): WebhookResourceType {
  const map: Record<string, WebhookResourceType> = {
    invoice: 'invoice',
    payment: 'payment',
    client: 'contact',
    credit: 'creditmemo',
    estimate: 'order',
    expense: 'expense',
    account: 'account',
    project: 'unknown',
    task: 'unknown',
  }
  return map[objectType.toLowerCase()] ?? 'unknown'
}

function mapAction(event: string): WebhookAction {
  const parts = event.split('.')
  const verb = (parts[1] ?? '').toLowerCase()
  if (verb === 'create') return 'created'
  if (verb === 'update') return 'updated'
  if (verb === 'delete' || verb === 'destroy') return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const freshbooksWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const sig = headers['x-freshbooks-hmac-sha256'] ?? ''
    return verifyHmacSha256(payload, secret, sig, 'hex')
  },

  parseWebhookEvents(payload) {
    const body = payload as FreshBooksWebhookPayload
    if (!body.object_type && !body.event) return []

    const objectType = body.object_type ?? (body.event?.split('.')[0] ?? 'unknown')
    const resourceType = mapResourceType(objectType)
    const action = body.event ? mapAction(body.event) : 'unknown'
    const resourceId = String(body.object_id ?? '')

    return [
      {
        platform: 'freshbooks',
        type: `${resourceType}.${action}`,
        resourceType,
        action,
        resourceId,
        tenantId: body.account_id ?? body.system,
        externalAccountId: body.account_id ?? body.system,
        payload,
      },
    ]
  },
}
