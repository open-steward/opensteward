/**
 * Universign webhook verification + parsing.
 *
 * Universign signs webhook deliveries with HMAC-SHA256 of the raw body
 * using the per-subscription signing secret. The signature ships as the
 * `X-Universign-Signature` header (raw hex).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyUniversignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const raw = headers['x-universign-signature'] ?? headers['X-Universign-Signature']
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
  'transaction.created': { resourceType: 'envelopes', action: 'created' },
  'transaction.ready': { resourceType: 'envelopes', action: 'sent' },
  'transaction.completed': { resourceType: 'envelopes', action: 'completed' },
  'transaction.expired': { resourceType: 'envelopes', action: 'expired' },
  'transaction.canceled': { resourceType: 'envelopes', action: 'voided' },
  'transaction.failed': { resourceType: 'envelopes', action: 'expired' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
  'signer.viewed': { resourceType: 'signers', action: 'viewed' },
}

export function parseUniversignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const tx = (data['transaction'] as Record<string, unknown> | undefined) ?? data
  const signer = (data['signer'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(tx['id'] ?? payload['transaction_id'] ?? '')
  const signerId = String(signer['id'] ?? payload['signer_id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `universign:${event}:${envelopeId}:${signerId}`,
      platform: 'universign',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const UniversignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyUniversignWebhook,
  parseWebhookEvents: parseUniversignWebhookEvents,
}
