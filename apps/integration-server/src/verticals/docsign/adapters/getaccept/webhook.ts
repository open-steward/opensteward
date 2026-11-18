/**
 * GetAccept webhook verification + event parsing.
 *
 * GetAccept signs deliveries with an HMAC-SHA256 of the raw body using the
 * configured webhook secret. The signature header is
 * `X-GetAccept-Signature` (hex).
 *
 * Docs: https://developers.getaccept.com/?version=v1#webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = ['x-getaccept-signature', 'getaccept-signature']

export function verifyGetAcceptWebhook(
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
  'document.created': 'created',
  'document.sent': 'sent',
  'document.viewed': 'viewed',
  'document.reviewed': 'viewed',
  'document.signed': 'signed',
  'document.completed': 'completed',
  'document.rejected': 'declined',
  'document.declined': 'declined',
  'document.recalled': 'voided',
  'document.expired': 'expired',
  'document.opened': 'viewed',
  'recipient.viewed': 'viewed',
  'recipient.signed': 'signed',
  'recipient.declined': 'declined',
  'recipient.reviewed': 'viewed',
  'template.created': 'created',
  'template.updated': 'updated',
  'template.deleted': 'deleted',
}

function classify(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lower = event.toLowerCase()
  if (lower.startsWith('document.')) {
    return { resourceType: 'envelopes', action: ACTION_MAP[lower] ?? 'updated' }
  }
  if (lower.startsWith('recipient.')) {
    return { resourceType: 'signers', action: ACTION_MAP[lower] ?? 'updated' }
  }
  if (lower.startsWith('template.')) {
    return { resourceType: 'templates', action: ACTION_MAP[lower] ?? 'updated' }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseGetAcceptWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const documentId = String(
    data['document_id'] ?? data['id'] ?? payload['document_id'] ?? '',
  )
  const recipientId = String(
    data['recipient_id'] ?? payload['recipient_id'] ?? '',
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
      id: `getaccept:${event}:${documentId}:${recipientId}`,
      platform: 'getaccept',
      type: event || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const GetAcceptWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyGetAcceptWebhook,
  parseWebhookEvents: parseGetAcceptWebhookEvents,
}
