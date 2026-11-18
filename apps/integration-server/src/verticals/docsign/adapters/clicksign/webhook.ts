/**
 * Clicksign webhook verification + event parsing.
 *
 * Clicksign signs webhook deliveries with HMAC-SHA256 of the raw body using
 * the secret configured on the webhook subscription. The signature ships as
 * the `Content-Hmac` header in the form `sha256=<hex>`.
 *
 * Docs: https://developers.clicksign.com/docs/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyClicksignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided =
      headers['content-hmac'] ?? headers['Content-Hmac'] ?? headers['Content-HMAC']
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
  'upload': { resourceType: 'envelopes', action: 'created' },
  'add_signer': { resourceType: 'signers', action: 'created' },
  'remove_signer': { resourceType: 'signers', action: 'deleted' },
  'sign': { resourceType: 'signers', action: 'signed' },
  'refusal': { resourceType: 'signers', action: 'declined' },
  'auto_close': { resourceType: 'envelopes', action: 'completed' },
  'close': { resourceType: 'envelopes', action: 'completed' },
  'deadline': { resourceType: 'envelopes', action: 'expired' },
  'cancel': { resourceType: 'envelopes', action: 'voided' },
  'update_deadline': { resourceType: 'envelopes', action: 'updated' },
}

export function parseClicksignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const document = (payload['document'] as Record<string, unknown> | undefined) ?? data
  const envelopeId = String(document['key'] ?? document['id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId =
    resourceType === 'signers' ? String(data['signer_key'] ?? data['key'] ?? envelopeId) : envelopeId
  return [
    {
      id: `clicksign:${event}:${envelopeId}:${data['signer_key'] ?? ''}`,
      platform: 'clicksign',
      type: event,
      resourceType,
      action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const ClicksignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyClicksignWebhook,
  parseWebhookEvents: parseClicksignWebhookEvents,
}
