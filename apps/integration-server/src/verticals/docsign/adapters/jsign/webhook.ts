/**
 * jSign webhook verification + event parsing.
 *
 * jSign delivers webhook payloads via HTTP POST. The platform signs each
 * delivery with an HMAC-SHA256 of the raw request body using a shared
 * webhook secret. The signature is sent in the `X-jSign-Signature` header
 * as a hex-encoded string. Verification uses `timingSafeEqual` to prevent
 * timing attacks.
 *
 * Webhook event bodies carry a top-level `event_type` string and an `envelope`
 * object with envelope details. Common event_type values: envelope.sent,
 * envelope.completed, envelope.declined, envelope.cancelled, envelope.expired,
 * signer.viewed, signer.signed, signer.declined.
 *
 * Docs: https://api.jsign.com/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADER = 'x-jsign-signature'

export function verifyJsignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const sig = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()] ?? ''
    if (!sig) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const expectedBuf = Buffer.from(expected, 'utf8')
    const providedBuf = Buffer.from(sig, 'utf8')
    if (expectedBuf.length !== providedBuf.length) return false
    return timingSafeEqual(expectedBuf, providedBuf)
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
  'envelope.canceled': { resourceType: 'envelopes', action: 'voided' },
  'envelope.expired': { resourceType: 'envelopes', action: 'updated' },
  'envelope.updated': { resourceType: 'envelopes', action: 'updated' },
  'signer.sent': { resourceType: 'signers', action: 'sent' },
  'signer.viewed': { resourceType: 'signers', action: 'viewed' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
  'template.created': { resourceType: 'templates', action: 'created' },
  'template.updated': { resourceType: 'templates', action: 'updated' },
  'template.deleted': { resourceType: 'templates', action: 'deleted' },
}

interface JsignWebhookBody {
  event_type?: string
  event_id?: string
  occurred_at?: string
  envelope?: { id?: string; envelope_id?: string }
  signer?: { id?: string }
  template?: { id?: string }
  [key: string]: unknown
}

export function parseJsignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const body = payload as JsignWebhookBody
  const eventType = String(body.event_type ?? '')
  const { resourceType, action } = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const envelopeId = body.envelope?.id ?? body.envelope?.envelope_id ?? ''
  const signerId = body.signer?.id ?? ''
  const templateId = body.template?.id ?? ''
  let resourceId = envelopeId
  if (resourceType === 'signers') resourceId = signerId || envelopeId
  else if (resourceType === 'templates') resourceId = templateId
  return [
    {
      id: body.event_id ?? `jsign:${eventType}:${envelopeId}:${signerId}`,
      platform: 'jsign',
      type: eventType || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const JsignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyJsignWebhook,
  parseWebhookEvents: parseJsignWebhookEvents,
}
