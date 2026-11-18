/**
 * SignNow webhook verification + parsing.
 *
 * SignNow signs webhooks with HMAC-SHA256 of the raw body using the secret
 * configured on the webhook subscription. The signature ships as the
 * `x-signnow-signature` header (hex).
 *
 * Docs: https://docs.signnow.com/docs/signnow/webhooks/overview
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifySignNowWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers['x-signnow-signature'] ?? headers['X-Signnow-Signature']
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
  'document.create': { resourceType: 'envelopes', action: 'created' },
  'document.update': { resourceType: 'envelopes', action: 'updated' },
  'document.delete': { resourceType: 'envelopes', action: 'deleted' },
  'invite.create': { resourceType: 'envelopes', action: 'sent' },
  'invite.update': { resourceType: 'signers', action: 'updated' },
  'invite.fulfill': { resourceType: 'signers', action: 'signed' },
  'invite.decline': { resourceType: 'signers', action: 'declined' },
  'invite.cancel': { resourceType: 'envelopes', action: 'voided' },
  'invite.expire': { resourceType: 'envelopes', action: 'expired' },
  'document.complete': { resourceType: 'envelopes', action: 'completed' },
}

export function parseSignNowWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event_type'] ?? payload['event'] ?? '')
  const meta = (payload['meta'] as Record<string, unknown> | undefined) ?? {}
  const content = (payload['content'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(meta['document_id'] ?? content['document_id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `signnow:${event}:${envelopeId}:${meta['user_id'] ?? ''}`,
      platform: 'signnow',
      type: event,
      resourceType,
      action,
      resourceId: envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const SignNowWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySignNowWebhook,
  parseWebhookEvents: parseSignNowWebhookEvents,
}
