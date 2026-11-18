/**
 * Signaturit webhook verification + parsing.
 *
 * Signaturit signs webhook deliveries with HMAC-SHA256 of the raw body
 * using the per-subscription signing secret. The signature ships as the
 * `X-Signaturit-Signature` header (raw hex).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifySignaturitWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const raw = headers['x-signaturit-signature'] ?? headers['X-Signaturit-Signature']
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
  'signature.created': { resourceType: 'envelopes', action: 'created' },
  'signature.ready': { resourceType: 'envelopes', action: 'sent' },
  'signature.completed': { resourceType: 'envelopes', action: 'completed' },
  'signature.expired': { resourceType: 'envelopes', action: 'expired' },
  'signature.canceled': { resourceType: 'envelopes', action: 'voided' },
  'signature.declined': { resourceType: 'envelopes', action: 'declined' },
  'signer.opened': { resourceType: 'signers', action: 'viewed' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
}

export function parseSignaturitWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const signature = (data['signature'] as Record<string, unknown> | undefined) ?? data
  const signer = (data['signer'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(signature['id'] ?? payload['signature_id'] ?? '')
  const signerId = String(signer['id'] ?? payload['signer_id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `signaturit:${event}:${envelopeId}:${signerId}`,
      platform: 'signaturit',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const SignaturitWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySignaturitWebhook,
  parseWebhookEvents: parseSignaturitWebhookEvents,
}
