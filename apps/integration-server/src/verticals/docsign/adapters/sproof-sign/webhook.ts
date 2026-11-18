/**
 * Sproof Sign webhook verification + parsing.
 *
 * Sproof signs webhook deliveries with HMAC-SHA256 of the raw body
 * using the per-subscription signing secret. The signature ships as the
 * `X-Sproof-Signature` header (raw hex).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifySproofSignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const raw = headers['x-sproof-signature'] ?? headers['X-Sproof-Signature']
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
  'signature_request.created': { resourceType: 'envelopes', action: 'created' },
  'signature_request.pending': { resourceType: 'envelopes', action: 'sent' },
  'signature_request.signed': { resourceType: 'envelopes', action: 'completed' },
  'signature_request.expired': { resourceType: 'envelopes', action: 'expired' },
  'signature_request.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
  'signer.viewed': { resourceType: 'signers', action: 'viewed' },
}

export function parseSproofSignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const sigReq = (data['signature_request'] as Record<string, unknown> | undefined) ?? data
  const signer = (data['signer'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(sigReq['id'] ?? payload['signature_request_id'] ?? '')
  const signerId = String(signer['id'] ?? payload['signer_id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `sproof-sign:${event}:${envelopeId}:${signerId}`,
      platform: 'sproof-sign',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const SproofSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySproofSignWebhook,
  parseWebhookEvents: parseSproofSignWebhookEvents,
}
