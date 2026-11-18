/**
 * Dropbox Sign event-callback webhook verification + parsing.
 *
 * Dropbox Sign signs callbacks with HMAC-SHA256 of the event-time + event-type
 * concatenation, using the app's API key as the secret. The signature ships
 * on the JSON body as `event.event_hash`.
 *
 * Docs: https://developers.hellosign.com/api/reference/operation/eventCallback/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

interface DropboxSignEventBody {
  event?: {
    event_time?: string
    event_type?: string
    event_hash?: string
    event_metadata?: Record<string, unknown>
  }
  signature_request?: { signature_request_id?: string }
  template?: { template_id?: string }
  account?: { account_id?: string }
}

export function verifyDropboxSignWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const body: DropboxSignEventBody = JSON.parse(payload.toString('utf8'))
    const eventTime = body.event?.event_time ?? ''
    const eventType = body.event?.event_type ?? ''
    const eventHash = body.event?.event_hash ?? ''
    if (!eventTime || !eventType || !eventHash) return false
    const expected = createHmac('sha256', secret).update(`${eventTime}${eventType}`).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(eventHash, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  signature_request_sent: { resourceType: 'envelopes', action: 'sent' },
  signature_request_viewed: { resourceType: 'envelopes', action: 'viewed' },
  signature_request_signed: { resourceType: 'signers', action: 'signed' },
  signature_request_downloadable: { resourceType: 'envelopes', action: 'completed' },
  signature_request_all_signed: { resourceType: 'envelopes', action: 'completed' },
  signature_request_email_bounce: { resourceType: 'envelopes', action: 'updated' },
  signature_request_remind: { resourceType: 'envelopes', action: 'updated' },
  signature_request_declined: { resourceType: 'envelopes', action: 'declined' },
  signature_request_reassigned: { resourceType: 'signers', action: 'updated' },
  signature_request_invalid: { resourceType: 'envelopes', action: 'expired' },
  signature_request_canceled: { resourceType: 'envelopes', action: 'voided' },
  signature_request_prepared: { resourceType: 'envelopes', action: 'created' },
  template_created: { resourceType: 'templates', action: 'created' },
  template_error: { resourceType: 'templates', action: 'updated' },
  callback_test: { resourceType: 'unknown', action: 'unknown' },
}

export function parseDropboxSignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const body = payload as DropboxSignEventBody
  const eventType = body.event?.event_type ?? ''
  const { resourceType, action } = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const envelopeId = body.signature_request?.signature_request_id ?? ''
  const templateId = body.template?.template_id ?? ''
  const resourceId = resourceType === 'templates' ? templateId : envelopeId
  return [
    {
      id: `dropbox-sign:${eventType}:${envelopeId || templateId}:${body.event?.event_time ?? ''}`,
      platform: 'dropbox-sign',
      type: eventType,
      resourceType,
      action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const DropboxSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDropboxSignWebhook,
  parseWebhookEvents: parseDropboxSignWebhookEvents,
}
