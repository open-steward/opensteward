/**
 * Documenso webhook verification + event parsing.
 *
 * Documenso does NOT HMAC-sign webhook deliveries. When a webhook is created
 * with a secret, that secret is echoed verbatim in the `X-Documenso-Secret`
 * header on every delivery; the receiver compares it (constant-time) against
 * the stored secret. If no secret is configured the header is absent.
 *
 * The body is JSON of the shape `{ event, payload, createdAt, webhookEndpoint }`,
 * where `event` is one of DOCUMENT_CREATED, DOCUMENT_SENT, DOCUMENT_OPENED,
 * DOCUMENT_SIGNED, DOCUMENT_COMPLETED, DOCUMENT_REJECTED, DOCUMENT_CANCELLED.
 *
 * Docs: https://docs.documenso.com/developers/public-api/webhooks
 */

import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'
import { WEBHOOK_SECRET_HEADER } from './constants'

export function verifyDocumensoWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const provided = headers[WEBHOOK_SECRET_HEADER] ?? headers[WEBHOOK_SECRET_HEADER.toLowerCase()]
    if (typeof provided !== 'string' || provided.length === 0) return false
    const a = Buffer.from(provided)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookAction> = {
  DOCUMENT_CREATED: 'created',
  DOCUMENT_SENT: 'sent',
  DOCUMENT_OPENED: 'viewed',
  DOCUMENT_SIGNED: 'signed',
  DOCUMENT_COMPLETED: 'completed',
  DOCUMENT_REJECTED: 'declined',
  DOCUMENT_CANCELLED: 'voided',
}

export function parseDocumensoWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const documentId = data['id'] != null ? String(data['id']) : ''
  const action = ACTION_MAP[event.toUpperCase()] ?? 'unknown'
  const resourceType: WebhookResourceType = event ? 'envelopes' : 'unknown'
  const createdAt = String(payload['createdAt'] ?? '')
  return [
    {
      id: `documenso:${event}:${documentId}:${createdAt}`,
      platform: 'documenso',
      type: event,
      resourceType,
      action,
      resourceId: documentId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const DocumensoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDocumensoWebhook,
  parseWebhookEvents: parseDocumensoWebhookEvents,
}
