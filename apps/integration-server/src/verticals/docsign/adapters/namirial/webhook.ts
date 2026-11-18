/**
 * Namirial webhook verification + parsing.
 *
 * Namirial signs webhook deliveries with HMAC-SHA256 of the raw body
 * using the per-subscription signing secret. The signature ships as the
 * `X-Namirial-Signature` header (raw hex).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyNamirialWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const raw = headers['x-namirial-signature'] ?? headers['X-Namirial-Signature']
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
  'envelope.created': { resourceType: 'envelopes', action: 'created' },
  'envelope.sent': { resourceType: 'envelopes', action: 'sent' },
  'envelope.completed': { resourceType: 'envelopes', action: 'completed' },
  'envelope.declined': { resourceType: 'envelopes', action: 'declined' },
  'envelope.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'envelope.expired': { resourceType: 'envelopes', action: 'expired' },
  'recipient.signed': { resourceType: 'signers', action: 'signed' },
  'recipient.declined': { resourceType: 'signers', action: 'declined' },
  'recipient.viewed': { resourceType: 'signers', action: 'viewed' },
}

export function parseNamirialWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const envelope = (data['envelope'] as Record<string, unknown> | undefined) ?? data
  const recipient = (data['recipient'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(envelope['id'] ?? payload['envelope_id'] ?? '')
  const recipientId = String(recipient['id'] ?? payload['recipient_id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `namirial:${event}:${envelopeId}:${recipientId}`,
      platform: 'namirial',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? recipientId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const NamirialWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyNamirialWebhook,
  parseWebhookEvents: parseNamirialWebhookEvents,
}
