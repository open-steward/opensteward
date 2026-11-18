/**
 * Nitro Sign webhook verification + event parsing.
 *
 * Nitro Sign signs deliveries with HMAC-SHA256 of the raw body, hex-
 * encoded, in the `X-Nitro-Signature` header. The verifier accepts bare
 * hex or `sha256=<hex>`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = ['x-nitro-signature']

function pickSignature(headers: Record<string, string>): string | undefined {
  for (const [k, v] of Object.entries(headers)) {
    if (SIG_HEADERS.includes(k.toLowerCase())) {
      return v.startsWith('sha256=') ? v.slice('sha256='.length) : v
    }
  }
  return undefined
}

export function verifyNitroSignWebhook(
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
  'transaction.created': { resourceType: 'envelopes', action: 'created' },
  'transaction.sent': { resourceType: 'envelopes', action: 'sent' },
  'transaction.delivered': { resourceType: 'envelopes', action: 'delivered' },
  'transaction.viewed': { resourceType: 'envelopes', action: 'viewed' },
  'transaction.completed': { resourceType: 'envelopes', action: 'completed' },
  'transaction.declined': { resourceType: 'envelopes', action: 'declined' },
  'transaction.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'transaction.expired': { resourceType: 'envelopes', action: 'expired' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
  'signer.viewed': { resourceType: 'signers', action: 'viewed' },
  'template.created': { resourceType: 'templates', action: 'created' },
  'template.updated': { resourceType: 'templates', action: 'updated' },
}

export function parseNitroSignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType =
    (typeof payload['event'] === 'string' && (payload['event'] as string)) ||
    (typeof payload['type'] === 'string' && (payload['type'] as string)) ||
    ''
  const data =
    (payload['data'] as Record<string, unknown> | undefined) ??
    (payload['transaction'] as Record<string, unknown> | undefined) ??
    {}
  const envelopeId = String(
    data['id'] ?? data['transactionId'] ?? payload['transactionId'] ?? '',
  )
  const signerId = String(data['signerId'] ?? data['signer_id'] ?? '')
  const templateId = String(data['templateId'] ?? data['template_id'] ?? '')
  const classified = ACTION_MAP[eventType.toLowerCase()] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId =
    classified.resourceType === 'signers'
      ? signerId || envelopeId
      : classified.resourceType === 'templates'
        ? templateId
        : envelopeId
  return [
    {
      id: `nitro-sign:${eventType}:${envelopeId}:${signerId}:${String(payload['timestamp'] ?? '')}`,
      platform: 'nitro-sign',
      type: eventType,
      resourceType: classified.resourceType,
      action: classified.action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const NitroSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyNitroSignWebhook,
  parseWebhookEvents: parseNitroSignWebhookEvents,
}
