/**
 * Skribble webhook verification + parsing.
 *
 * Skribble signs webhook deliveries with HMAC-SHA256 of the raw body
 * using the per-subscription signing secret. The signature ships as the
 * `X-Skribble-Signature` header (raw hex; no `sha256=` prefix).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifySkribbleWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const raw = headers['x-skribble-signature'] ?? headers['X-Skribble-Signature']
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
  'signature_request.open': { resourceType: 'envelopes', action: 'sent' },
  'signature_request.signed': { resourceType: 'envelopes', action: 'completed' },
  'signature_request.declined': { resourceType: 'envelopes', action: 'declined' },
  'signature_request.withdrawn': { resourceType: 'envelopes', action: 'voided' },
  'signature.signed': { resourceType: 'signers', action: 'signed' },
  'signature.declined': { resourceType: 'signers', action: 'declined' },
}

export function parseSkribbleWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const sigReq = (data['signature_request'] as Record<string, unknown> | undefined) ?? data
  const signature = (data['signature'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(sigReq['id'] ?? payload['signature_request_id'] ?? '')
  const signerId = String(signature['id'] ?? payload['signature_id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `skribble:${event}:${envelopeId}:${signerId}`,
      platform: 'skribble',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const SkribbleWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySkribbleWebhook,
  parseWebhookEvents: parseSkribbleWebhookEvents,
}
