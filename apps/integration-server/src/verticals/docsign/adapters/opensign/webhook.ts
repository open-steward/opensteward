/**
 * OpenSign™ webhook verification + event parsing.
 *
 * OpenSign signs every webhook delivery with an HMAC-SHA256 of the raw
 * request body using your webhook security key, shipped in the
 * `x-webhook-signature` header (hex-encoded). Compare with
 * `timingSafeEqual`.
 *
 * Events: created, viewed, signed, completed, declined. Each payload carries
 * `event`, `type`, `objectId` (document id), `name`, `signers[]`, and
 * `createdAt`; event-specific fields (`signer`, `viewedBy`, `declinedBy`,
 * `certificate`) ride along.
 *
 * Docs: https://docs.opensignlabs.com/docs/help/Settings/Webhook/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'
import { WEBHOOK_SIGNATURE_HEADER } from './constants'

export function verifyOpensignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[WEBHOOK_SIGNATURE_HEADER] ?? headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()]
    if (!provided || !secret) return false
    const expectedHex = createHmac('sha256', secret).update(payload).digest('hex')
    // Accept either a bare hex digest or a `sha256=`-prefixed form.
    const normalised = provided.startsWith('sha256=') ? provided.slice('sha256='.length) : provided
    const a = Buffer.from(expectedHex, 'hex')
    const b = Buffer.from(normalised, 'hex')
    if (a.length === 0 || a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  viewed: 'viewed',
  signed: 'signed',
  completed: 'completed',
  declined: 'declined',
  revoked: 'voided',
  expired: 'expired',
}

function classify(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = event.toLowerCase()
  const action = ACTION_MAP[lowered] ?? 'unknown'
  // `signed` / `viewed` are signer-level activities; the rest are envelope-level.
  const resourceType: WebhookResourceType =
    lowered === 'signed' || lowered === 'viewed' ? 'signers' : 'envelopes'
  return { resourceType: action === 'unknown' ? 'unknown' : resourceType, action }
}

export function parseOpensignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const objectId = String(payload['objectId'] ?? '')
  const createdAt = String(payload['createdAt'] ?? '')
  const { resourceType, action } = classify(event)
  return [
    {
      id: `opensign:${event}:${objectId}:${createdAt}`,
      platform: 'opensign',
      type: event,
      resourceType,
      action,
      resourceId: objectId,
      envelopeId: objectId || undefined,
      payload,
    },
  ]
}

export const OpensignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyOpensignWebhook,
  parseWebhookEvents: parseOpensignWebhookEvents,
}
