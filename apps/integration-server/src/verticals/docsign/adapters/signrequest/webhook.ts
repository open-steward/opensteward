/**
 * SignRequest event-callback (webhook) verification + parsing.
 *
 * SignRequest POSTs a JSON callback to the configured URL for every event.
 * There is NO signature header. Instead the body carries an `event_hash`
 * field which is HMAC-SHA256(key=apiToken, msg=event_time+event_type)
 * hex-encoded. The `secret` passed here must be the account/team API token.
 *
 * Reference: official SignRequest event-receiver example
 *   https://github.com/SignRequest/signrequest-event-receiver/blob/master/handlers/main_handler.py
 *
 * Callback body shape:
 *   {
 *     "event_type": "signed",
 *     "event_hash": "<hex hmac>",
 *     "event_time": "2026-01-15T09:30:00Z",
 *     "timestamp": "...",
 *     "document": { "uuid": "...", "status": "si", ... },
 *     "signer": { "uuid": "...", "email": "...", ... } | null,
 *     "status": "..."
 *   }
 *
 * Docs: https://signrequest.com/api/v1/docs/ (Events / callbacks)
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

interface SignRequestEventBody {
  event_type?: string
  event_hash?: string
  event_time?: string
  timestamp?: string
  status?: string
  document?: { uuid?: string; status?: string } | null
  signer?: { uuid?: string; email?: string } | null
}

function hexEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  try {
    const ab = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ab.length === 0 || ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

export function verifySignRequestWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // SignRequest does not use a signature header. The body carries event_hash
    // which is HMAC-SHA256(key=apiToken, msg=event_time+event_type).
    const body = JSON.parse(payload.toString('utf8')) as SignRequestEventBody
    const eventTime = body.event_time ?? ''
    const eventType = body.event_type ?? ''
    const provided = body.event_hash ?? ''
    if (!eventTime || !eventType || !provided) return false
    const expected = createHmac('sha256', secret)
      .update(eventTime + eventType, 'utf8')
      .digest('hex')
    return hexEqual(provided, expected)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  converted: { resourceType: 'documents', action: 'created' },
  sent: { resourceType: 'envelopes', action: 'sent' },
  sent_to_signer: { resourceType: 'signers', action: 'sent' },
  viewed: { resourceType: 'envelopes', action: 'viewed' },
  signer_viewed: { resourceType: 'signers', action: 'viewed' },
  signer_viewed_email: { resourceType: 'signers', action: 'viewed' },
  signed: { resourceType: 'envelopes', action: 'completed' },
  signer_signed: { resourceType: 'signers', action: 'signed' },
  downloaded: { resourceType: 'envelopes', action: 'completed' },
  declined: { resourceType: 'envelopes', action: 'declined' },
  signer_declined: { resourceType: 'signers', action: 'declined' },
  cancelled: { resourceType: 'envelopes', action: 'voided' },
  canceled: { resourceType: 'envelopes', action: 'voided' },
  expired: { resourceType: 'envelopes', action: 'expired' },
  signer_forwarded: { resourceType: 'signers', action: 'updated' },
  signer_email_bounced: { resourceType: 'signers', action: 'updated' },
  signer_needs_to_sign: { resourceType: 'signers', action: 'updated' },
}

export function parseSignRequestWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const body = payload as SignRequestEventBody
  const eventType = (body.event_type ?? '').toLowerCase()
  const { resourceType, action } = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const documentUuid = body.document?.uuid ?? ''
  const signerUuid = body.signer?.uuid ?? ''
  const resourceId = resourceType === 'signers' ? signerUuid || documentUuid : documentUuid
  const when = body.event_time ?? body.timestamp ?? ''
  return [
    {
      id: `signrequest:${eventType}:${documentUuid}:${signerUuid}:${when}`,
      platform: 'signrequest',
      type: eventType,
      resourceType,
      action,
      resourceId,
      envelopeId: documentUuid || undefined,
      payload,
    },
  ]
}

export const SignRequestWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySignRequestWebhook,
  parseWebhookEvents: parseSignRequestWebhookEvents,
}
