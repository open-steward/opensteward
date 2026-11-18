/**
 * Lumin Sign webhook verification + event parsing.
 *
 * Lumin signs every webhook delivery with an HMAC-SHA256 hex digest of the
 * raw request body, keyed by the account's **primary API key**. The digest
 * ships in the `X-Signature` header. Compare hex-decoded with
 * `timingSafeEqual`.
 *
 * The JSON body wraps an `event` object (`event_type`, `event_time`,
 * `event_metadata`) and a `signature_request` object carrying the
 * `signature_request_id`.
 *
 * Docs: https://developers.luminpdf.com/tabs/guides/webhooks/overview
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIGNATURE_HEADER = 'x-signature'

export function verifyLuminSignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIGNATURE_HEADER] ?? headers['X-Signature']
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(provided, 'hex')
    if (a.length === 0 || a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

interface LuminSignEventBody {
  event?: {
    event_time?: number
    event_type?: string
    event_metadata?: Record<string, unknown>
  }
  signature_request?: { signature_request_id?: string }
  details_url?: string
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  signature_request_created: { resourceType: 'envelopes', action: 'created' },
  signature_request_viewed: { resourceType: 'envelopes', action: 'viewed' },
  signature_request_signed: { resourceType: 'signers', action: 'signed' },
  signature_request_approved: { resourceType: 'envelopes', action: 'completed' },
  signature_request_declined: { resourceType: 'envelopes', action: 'declined' },
  signature_request_downloadable: { resourceType: 'envelopes', action: 'completed' },
  signature_request_invalid: { resourceType: 'envelopes', action: 'expired' },
  signature_request_canceled: { resourceType: 'envelopes', action: 'voided' },
  signature_request_cancel_failed: { resourceType: 'envelopes', action: 'updated' },
  signature_request_due_date_updated: { resourceType: 'envelopes', action: 'updated' },
}

export function parseLuminSignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const body = payload as LuminSignEventBody
  const eventType = body.event?.event_type ?? ''
  const { resourceType, action } = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const envelopeId = body.signature_request?.signature_request_id ?? ''
  const eventTime = body.event?.event_time ?? ''
  return [
    {
      id: `lumin-sign:${eventType}:${envelopeId}:${eventTime}`,
      platform: 'lumin-sign',
      type: eventType,
      resourceType,
      action,
      resourceId: envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const LuminSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyLuminSignWebhook,
  parseWebhookEvents: parseLuminSignWebhookEvents,
}
