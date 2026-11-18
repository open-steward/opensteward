/**
 * Signicat events/webhooks verification + event parsing.
 *
 * Signicat signs every webhook delivery with an HMAC-SHA256 of the raw
 * request body, keyed by the subscription's secret token. The signature
 * ships in the `X-Signicat-Signature` header as an uppercase hex string.
 * Verification MUST run over the raw body — any re-serialisation (whitespace
 * or key-order changes) breaks the hash.
 *
 * Event envelope (all deliveries):
 *   { id, timestamp, sender, eventName, eventData, accountId,
 *     organizationId, expiresAt, tags }
 * For electronic signing, `eventData` carries the signing-session `id`
 * (and `externalReference`).
 *
 * Docs: https://developer.signicat.com/docs/events/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADER = 'x-signicat-signature'

export function verifySignicatWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers[SIG_HEADER.toUpperCase()]
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    // Signicat emits uppercase hex; normalise both sides before comparing.
    const a = Buffer.from(expected.toLowerCase(), 'utf8')
    const b = Buffer.from(provided.toLowerCase(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'order.created': { resourceType: 'envelopes', action: 'created' },
  'order.started': { resourceType: 'envelopes', action: 'sent' },
  'order.completed': { resourceType: 'envelopes', action: 'completed' },
  'order.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'order.expired': { resourceType: 'envelopes', action: 'expired' },
  'order.rejected': { resourceType: 'envelopes', action: 'declined' },
  'document.signed': { resourceType: 'signers', action: 'signed' },
  'document.rejected': { resourceType: 'signers', action: 'declined' },
  'package.completed': { resourceType: 'envelopes', action: 'completed' },
  'package.failed': { resourceType: 'envelopes', action: 'voided' },
}

interface SignicatEventBody {
  id?: string
  timestamp?: string
  sender?: string
  eventName?: string
  eventData?: { id?: string; externalReference?: string; [key: string]: unknown }
  accountId?: string
  organizationId?: string
}

export function parseSignicatWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const body = payload as SignicatEventBody
  const eventName = body.eventName ?? ''
  const { resourceType, action } = ACTION_MAP[eventName] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const sessionId = body.eventData?.id ?? ''
  return [
    {
      id: body.id ?? `signicat:${eventName}:${sessionId}:${body.timestamp ?? ''}`,
      platform: 'signicat',
      type: eventName,
      resourceType,
      action,
      resourceId: sessionId,
      envelopeId: sessionId || undefined,
      payload,
    },
  ]
}

export const SignicatWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySignicatWebhook,
  parseWebhookEvents: parseSignicatWebhookEvents,
}
