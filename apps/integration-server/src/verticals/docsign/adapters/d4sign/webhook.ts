/**
 * D4Sign webhook verification + event parsing.
 *
 * D4Sign signs webhook deliveries with HMAC-SHA256 of the raw body using
 * the secret configured on the webhook subscription. The signature ships
 * as the `X-D4Sign-Signature` header (hex).
 *
 * Docs: https://docapi.d4sign.com.br/docs/api-de-webhooks (header naming
 * has shifted across doc versions; the verifier accepts the lowercase
 * canonical form plus the historical capitalised variant).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyD4SignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided =
      headers['x-d4sign-signature'] ??
      headers['X-D4Sign-Signature'] ??
      headers['x-d4sign-hmac'] ??
      headers['X-D4Sign-Hmac']
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const normalized = provided.startsWith('sha256=') ? provided.slice('sha256='.length) : provided
    const a = Buffer.from(normalized, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  '1': { resourceType: 'envelopes', action: 'created' },
  '2': { resourceType: 'envelopes', action: 'sent' },
  '3': { resourceType: 'signers', action: 'signed' },
  '4': { resourceType: 'envelopes', action: 'completed' },
  '5': { resourceType: 'envelopes', action: 'voided' },
  '6': { resourceType: 'signers', action: 'declined' },
  '7': { resourceType: 'envelopes', action: 'expired' },
  // Named events (some D4Sign configurations send keywords)
  'document.signed': { resourceType: 'signers', action: 'signed' },
  'document.finished': { resourceType: 'envelopes', action: 'completed' },
  'document.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'document.rejected': { resourceType: 'signers', action: 'declined' },
}

export function parseD4SignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['type_post'] ?? payload['type'] ?? payload['event'] ?? '')
  const uuid = String(payload['uuid'] ?? payload['document_uuid'] ?? '')
  const signerId = String(payload['signer_uuid'] ?? payload['email_signer'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId = resourceType === 'signers' && signerId ? signerId : uuid
  return [
    {
      id: `d4sign:${event}:${uuid}:${signerId}`,
      platform: 'd4sign',
      type: event,
      resourceType,
      action,
      resourceId,
      envelopeId: uuid || undefined,
      payload,
    },
  ]
}

export const D4SignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyD4SignWebhook,
  parseWebhookEvents: parseD4SignWebhookEvents,
}
