/**
 * SignWell webhook verification + event parsing.
 *
 * SignWell signs deliveries with an HMAC-SHA256 of the raw body using the
 * configured webhook secret. The signature ships as `X-SignWell-Signature`
 * (hex).
 *
 * Docs: https://developers.signwell.com/docs/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = ['x-signwell-signature', 'signwell-signature']

export function verifySignWellWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const expectedBuf = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const providedBuf = Buffer.from(provided.trim(), 'utf8')
      if (providedBuf.length !== expectedBuf.length) continue
      if (timingSafeEqual(providedBuf, expectedBuf)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookAction> = {
  'document_sent': 'sent',
  'document_viewed': 'viewed',
  'document_signed': 'signed',
  'document_completed': 'completed',
  'document_declined': 'declined',
  'document_cancelled': 'voided',
  'document_canceled': 'voided',
  'document_expired': 'expired',
  'document_created': 'created',
  'document_corrected': 'updated',
  'recipient_viewed': 'viewed',
  'recipient_signed': 'signed',
  'recipient_declined': 'declined',
  'recipient_completed': 'signed',
  'template_created': 'created',
  'template_updated': 'updated',
  'template_deleted': 'deleted',
}

function classify(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lower = event.toLowerCase()
  if (lower.startsWith('document_')) {
    return { resourceType: 'envelopes', action: ACTION_MAP[lower] ?? 'updated' }
  }
  if (lower.startsWith('recipient_')) {
    return { resourceType: 'signers', action: ACTION_MAP[lower] ?? 'updated' }
  }
  if (lower.startsWith('template_')) {
    return { resourceType: 'templates', action: ACTION_MAP[lower] ?? 'updated' }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseSignWellWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['event_type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const documentId = String(
    data['document_id'] ?? data['id'] ?? payload['document_id'] ?? '',
  )
  const recipientId = String(
    data['recipient_id'] ?? data['recipient'] ?? payload['recipient_id'] ?? '',
  )
  const templateId = String(
    data['template_id'] ?? payload['template_id'] ?? '',
  )
  const { resourceType, action } = classify(event)
  const resourceId =
    resourceType === 'signers'
      ? recipientId || documentId
      : resourceType === 'templates'
        ? templateId
        : documentId
  return [
    {
      id: `signwell:${event}:${documentId}:${recipientId}`,
      platform: 'signwell',
      type: event || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const SignWellWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySignWellWebhook,
  parseWebhookEvents: parseSignWellWebhookEvents,
}
