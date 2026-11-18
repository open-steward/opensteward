/**
 * Yousign webhook verification + parsing.
 *
 * Yousign signs webhooks with HMAC-SHA256 of the raw body using the
 * subscription's secret. The signature ships as the
 * `X-Yousign-Signature-256` header in the form `sha256=<hex>`.
 *
 * Docs: https://developers.yousign.com/docs/webhook
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyYousignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const raw = headers['x-yousign-signature-256'] ?? headers['X-Yousign-Signature-256']
    if (!raw) return false
    const hex = raw.startsWith('sha256=') ? raw.slice('sha256='.length) : raw
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(hex, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'signature_request.activated': { resourceType: 'envelopes', action: 'sent' },
  'signature_request.done': { resourceType: 'envelopes', action: 'completed' },
  'signature_request.declined': { resourceType: 'envelopes', action: 'declined' },
  'signature_request.expired': { resourceType: 'envelopes', action: 'expired' },
  'signature_request.canceled': { resourceType: 'envelopes', action: 'voided' },
  'signer.notified': { resourceType: 'signers', action: 'sent' },
  'signer.link_opened': { resourceType: 'signers', action: 'viewed' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
  'document.viewed': { resourceType: 'documents', action: 'viewed' },
}

export function parseYousignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event_name'] ?? payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const sigReq = (data['signature_request'] as Record<string, unknown> | undefined) ?? {}
  const signer = (data['signer'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(sigReq['id'] ?? '')
  const signerId = String(signer['id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `yousign:${event}:${envelopeId}:${signerId}`,
      platform: 'yousign',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const YousignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyYousignWebhook,
  parseWebhookEvents: parseYousignWebhookEvents,
}
