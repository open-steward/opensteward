/**
 * PandaDoc webhook verification + parsing.
 *
 * PandaDoc signs webhooks with HMAC-SHA256 of the raw body using the shared
 * secret configured on the webhook. The signature ships as the
 * `signature` query parameter on the delivery URL. Because the signature is
 * URL-bound rather than header-bound, we expose a verifier that re-derives
 * the expected signature; the unified webhook router compares query-string
 * values upstream.
 *
 * Docs: https://developers.pandadoc.com/reference/webhook-events
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyPandaDocWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // PandaDoc puts the signature in the `signature` query param; the
    // unified router copies it into the lower-cased header bag under
    // `x-signature` before invoking the verifier.
    const provided = headers['x-signature'] ?? headers['signature']
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(provided, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  document_state_changed: { resourceType: 'envelopes', action: 'updated' },
  document_updated: { resourceType: 'envelopes', action: 'updated' },
  document_deleted: { resourceType: 'envelopes', action: 'deleted' },
  document_creation_failed: { resourceType: 'envelopes', action: 'updated' },
  document_completed_pdf_ready: { resourceType: 'envelopes', action: 'completed' },
  document_section_added: { resourceType: 'envelopes', action: 'updated' },
  recipient_completed: { resourceType: 'signers', action: 'signed' },
  recipient_viewed: { resourceType: 'signers', action: 'viewed' },
  quote_updated: { resourceType: 'envelopes', action: 'updated' },
}

export function parsePandaDocWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // PandaDoc delivers an array of events: [{event, event_id, ...}, ...]
  const events = Array.isArray(payload) ? (payload as Array<Record<string, unknown>>) : [payload]
  return events.map((evt) => {
    const eventType = String(evt['event'] ?? '')
    const data = (evt['data'] as Record<string, unknown> | undefined) ?? {}
    const envelopeId = String(data['id'] ?? '')
    const recipientId = String((data['recipient'] as Record<string, unknown> | undefined)?.['id'] ?? '')
    const { resourceType, action } = ACTION_MAP[eventType] ?? {
      resourceType: 'unknown' as WebhookResourceType,
      action: 'unknown' as WebhookAction,
    }
    return {
      id: String(evt['event_id'] ?? `pandadoc:${eventType}:${envelopeId}`),
      platform: 'pandadoc',
      type: eventType,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? recipientId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload: evt,
    }
  })
}

export const PandaDocWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPandaDocWebhook,
  parseWebhookEvents: parsePandaDocWebhookEvents,
}
