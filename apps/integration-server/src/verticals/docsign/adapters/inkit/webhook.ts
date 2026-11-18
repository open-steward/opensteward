import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * Inkit webhooks.
 *
 * Inkit signs each callback with HMAC-SHA256 (hex) of the raw request
 * body, keyed by the per-webhook secret, in the `Inkit-Signature` header.
 * Events are document-generation lifecycle codes (no e-signature
 * envelope/signer events — Inkit is a generation platform).
 *
 * Docs: https://docs.inkit.com/docs/connecting-webhooks
 *       https://docs.inkit.com/docs/inkit-webhook-events
 */
const SIG_HEADERS = ['inkit-signature', 'Inkit-Signature']

export function verifyInkitWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const b = Buffer.from(provided.trim(), 'utf8')
      if (a.length !== b.length) continue
      if (timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  DOCUMENT_CREATE_FINISHED: { resourceType: 'documents', action: 'created' },
  DOCUMENT_CREATE_FAILED: { resourceType: 'documents', action: 'unknown' },
  DOCUMENT_DELETED: { resourceType: 'documents', action: 'deleted' },
  DOCUMENT_PDF_ACCESS: { resourceType: 'documents', action: 'viewed' },
  DOCUSIGN_CREATE_FINISHED: { resourceType: 'documents', action: 'completed' },
  DOCUSIGN_CREATE_FAILED: { resourceType: 'documents', action: 'unknown' },
  MAGIC_LINK_ACCESS: { resourceType: 'documents', action: 'viewed' },
  MAGIC_LINK_CREATED: { resourceType: 'documents', action: 'created' },
}

export function parseInkitWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['event_type'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(
    (data['document'] as Record<string, unknown> | undefined)?.['id'] ??
      data['document_id'] ??
      data['id'] ??
      payload['document_id'] ??
      '',
  )
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `inkit:${event}:${resourceId}`,
      platform: 'inkit',
      type: event,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const InkitWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyInkitWebhook,
  parseWebhookEvents: parseInkitWebhookEvents,
}
