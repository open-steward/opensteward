/**
 * Digio webhook verification + event parsing.
 *
 * Digio signs webhook deliveries with HMAC-SHA256 of the raw body using
 * the secret configured on the webhook subscription. The signature ships
 * as the `X-Digio-Signature` header (hex).
 *
 * Docs: https://documentation.digio.in/ (webhooks section)
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyDigioWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided =
      headers['x-digio-signature'] ??
      headers['X-Digio-Signature'] ??
      headers['digio-signature']
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
  'document.requested': { resourceType: 'envelopes', action: 'sent' },
  'document.signed': { resourceType: 'signers', action: 'signed' },
  'document.completed': { resourceType: 'envelopes', action: 'completed' },
  'document.expired': { resourceType: 'envelopes', action: 'expired' },
  'document.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'document.declined': { resourceType: 'signers', action: 'declined' },
  'document.viewed': { resourceType: 'signers', action: 'viewed' },
}

export function parseDigioWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const documentId = String(data['id'] ?? data['document_id'] ?? '')
  const signerId = String(data['signer_id'] ?? data['identifier'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId =
    resourceType === 'signers' && signerId ? signerId : documentId
  return [
    {
      id: `digio:${event}:${documentId}:${signerId}`,
      platform: 'digio',
      type: event,
      resourceType,
      action,
      resourceId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const DigioWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDigioWebhook,
  parseWebhookEvents: parseDigioWebhookEvents,
}
