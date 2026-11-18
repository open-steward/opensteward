/**
 * Foxit eSign webhook verification + event parsing.
 *
 * Foxit eSign signs deliveries with HMAC-SHA256 of the raw request body
 * using the per-app webhook secret. The signature ships hex-encoded as
 * `X-Esign-Signature`. The verifier accepts either bare hex or a
 * `sha256=<hex>` prefix (some Foxit dashboards show one, some the other).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = ['x-esign-signature', 'x-esigngenie-signature']

function pickSignature(headers: Record<string, string>): string | undefined {
  for (const [k, v] of Object.entries(headers)) {
    if (SIG_HEADERS.includes(k.toLowerCase())) {
      return v.startsWith('sha256=') ? v.slice('sha256='.length) : v
    }
  }
  return undefined
}

export function verifyFoxitESignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = pickSignature(headers)
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(provided, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  envelope_sent: { resourceType: 'envelopes', action: 'sent' },
  envelope_delivered: { resourceType: 'envelopes', action: 'delivered' },
  envelope_viewed: { resourceType: 'envelopes', action: 'viewed' },
  envelope_completed: { resourceType: 'envelopes', action: 'completed' },
  envelope_signed: { resourceType: 'envelopes', action: 'completed' },
  envelope_declined: { resourceType: 'envelopes', action: 'declined' },
  envelope_voided: { resourceType: 'envelopes', action: 'voided' },
  envelope_expired: { resourceType: 'envelopes', action: 'expired' },
  envelope_created: { resourceType: 'envelopes', action: 'created' },
  recipient_signed: { resourceType: 'signers', action: 'signed' },
  recipient_viewed: { resourceType: 'signers', action: 'viewed' },
  recipient_declined: { resourceType: 'signers', action: 'declined' },
  template_created: { resourceType: 'templates', action: 'created' },
  template_updated: { resourceType: 'templates', action: 'updated' },
}

export function parseFoxitESignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType =
    (typeof payload['event'] === 'string' && (payload['event'] as string)) ||
    (typeof payload['type'] === 'string' && (payload['type'] as string)) ||
    ''
  const data =
    (payload['data'] as Record<string, unknown> | undefined) ??
    (payload['envelope'] as Record<string, unknown> | undefined) ??
    {}
  const envelopeId = String(
    data['envelopeId'] ?? data['envelope_id'] ?? payload['envelopeId'] ?? '',
  )
  const recipientId = String(
    data['recipientId'] ?? data['recipient_id'] ?? '',
  )
  const templateId = String(
    data['templateId'] ?? data['template_id'] ?? '',
  )
  const classified = ACTION_MAP[eventType.toLowerCase()] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId =
    classified.resourceType === 'signers'
      ? recipientId || envelopeId
      : classified.resourceType === 'templates'
        ? templateId
        : envelopeId
  return [
    {
      id: `foxit-esign:${eventType}:${envelopeId}:${recipientId}:${String(payload['timestamp'] ?? '')}`,
      platform: 'foxit-esign',
      type: eventType,
      resourceType: classified.resourceType,
      action: classified.action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const FoxitESignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFoxitESignWebhook,
  parseWebhookEvents: parseFoxitESignWebhookEvents,
}
