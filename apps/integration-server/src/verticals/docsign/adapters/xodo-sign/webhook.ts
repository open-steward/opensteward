/**
 * Xodo Sign (formerly eversign) webhook verification + event parsing.
 *
 * Xodo Sign POSTs a JSON body carrying an `event_hash` computed as
 * HMAC-SHA256 of `event_time . event_type` using the account API key as the
 * secret (per the docs: `hash_hmac("sha256", $event_time . $event_type,
 * $api_key)`). There is no signature header — the hash travels in the body,
 * like Dropbox Sign. We recompute and compare with `timingSafeEqual`.
 *
 * Docs: https://eversign.com/api/documentation/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

interface XodoSignEventBody {
  event_time?: number | string
  event_type?: string
  event_hash?: string
  meta?: {
    related_document_hash?: string
    related_user_id?: string
    related_business_id?: string
    related_app_id?: string
  }
  signer?: {
    id?: number | string
    name?: string
    email?: string
    role?: string
    order?: number | string
  }
}

export function verifyXodoSignWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const body: XodoSignEventBody = JSON.parse(payload.toString('utf8'))
    const eventTime = body.event_time != null ? String(body.event_time) : ''
    const eventType = body.event_type ?? ''
    const eventHash = body.event_hash ?? ''
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
  document_created: { resourceType: 'envelopes', action: 'created' },
  document_sent: { resourceType: 'envelopes', action: 'sent' },
  document_viewed: { resourceType: 'envelopes', action: 'viewed' },
  document_signed: { resourceType: 'signers', action: 'signed' },
  document_declined: { resourceType: 'envelopes', action: 'declined' },
  document_forwarded: { resourceType: 'envelopes', action: 'updated' },
  document_completed: { resourceType: 'envelopes', action: 'completed' },
  document_expired: { resourceType: 'envelopes', action: 'expired' },
  document_cancelled: { resourceType: 'envelopes', action: 'voided' },
  document_revoked: { resourceType: 'envelopes', action: 'voided' },
  signer_removed: { resourceType: 'signers', action: 'updated' },
  signer_bounced: { resourceType: 'signers', action: 'updated' },
  email_validation_waived: { resourceType: 'unknown', action: 'unknown' },
}

export function parseXodoSignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const body = payload as XodoSignEventBody
  const eventType = body.event_type ?? ''
  const { resourceType, action } = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const documentHash = body.meta?.related_document_hash ?? ''
  const signerId = body.signer?.id != null ? String(body.signer.id) : ''
  const resourceId = resourceType === 'signers' && signerId ? signerId : documentHash
  return [
    {
      id: `xodo-sign:${eventType}:${documentHash}:${signerId}:${body.event_time ?? ''}`,
      platform: 'xodo-sign',
      type: eventType,
      resourceType,
      action,
      resourceId,
      envelopeId: documentHash || undefined,
      payload,
    },
  ]
}

export const XodoSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyXodoSignWebhook,
  parseWebhookEvents: parseXodoSignWebhookEvents,
}
