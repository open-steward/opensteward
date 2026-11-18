/**
 * Lealos webhook verification + event parsing.
 *
 * Lealos signs webhook deliveries with HMAC-SHA256 of the raw body using
 * the secret configured on the webhook subscription. The signature ships
 * as the `X-Lealos-Signature` header (hex).
 *
 * NOTE: Lealos public docs do not exhaustively enumerate event types —
 * the action map below is conservative; unknown events surface as
 * { resourceType: 'unknown', action: 'unknown' } and still round-trip
 * the raw payload to downstream consumers.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyLealosWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided =
      headers['x-lealos-signature'] ??
      headers['X-Lealos-Signature'] ??
      headers['lealos-signature']
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const normalized = provided.startsWith('sha256=') ? provided.slice('sha256='.length) : provided
    const a = Buffer.from(normalized, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'document.created': { resourceType: 'envelopes', action: 'created' },
  'document.sent': { resourceType: 'envelopes', action: 'sent' },
  'document.completed': { resourceType: 'envelopes', action: 'completed' },
  'document.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'document.expired': { resourceType: 'envelopes', action: 'expired' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
  'signer.viewed': { resourceType: 'signers', action: 'viewed' },
}

export function parseLealosWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const documentId = String(data['document_id'] ?? data['id'] ?? '')
  const signerId = String(data['signer_id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId = resourceType === 'signers' && signerId ? signerId : documentId
  return [
    {
      id: `lealos:${event}:${documentId}:${signerId}`,
      platform: 'lealos',
      type: event,
      resourceType,
      action,
      resourceId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const LealosWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyLealosWebhook,
  parseWebhookEvents: parseLealosWebhookEvents,
}
