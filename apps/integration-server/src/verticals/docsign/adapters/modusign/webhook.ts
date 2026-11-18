/**
 * Modusign webhook verification + event parsing.
 *
 * Modusign signs webhook deliveries with HMAC-SHA256 of the raw body
 * using the secret configured on the webhook subscription. The signature
 * ships as the `x-modusign-signature` header (hex).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyModusignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided =
      headers['x-modusign-signature'] ??
      headers['X-Modusign-Signature'] ??
      headers['modusign-signature']
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
  'DOCUMENT_CREATED': { resourceType: 'envelopes', action: 'created' },
  'DOCUMENT_REQUESTED': { resourceType: 'envelopes', action: 'sent' },
  'DOCUMENT_SIGNED': { resourceType: 'signers', action: 'signed' },
  'DOCUMENT_COMPLETED': { resourceType: 'envelopes', action: 'completed' },
  'DOCUMENT_CANCELLED': { resourceType: 'envelopes', action: 'voided' },
  'DOCUMENT_REJECTED': { resourceType: 'signers', action: 'declined' },
  'DOCUMENT_EXPIRED': { resourceType: 'envelopes', action: 'expired' },
  'PARTICIPANT_SIGNED': { resourceType: 'signers', action: 'signed' },
  'PARTICIPANT_REJECTED': { resourceType: 'signers', action: 'declined' },
  'PARTICIPANT_VIEWED': { resourceType: 'signers', action: 'viewed' },
}

export function parseModusignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const documentId = String(data['documentId'] ?? data['document_id'] ?? data['id'] ?? '')
  const participantId = String(data['participantId'] ?? data['participant_id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId =
    resourceType === 'signers' && participantId ? participantId : documentId
  return [
    {
      id: `modusign:${event}:${documentId}:${participantId}`,
      platform: 'modusign',
      type: event,
      resourceType,
      action,
      resourceId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const ModusignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyModusignWebhook,
  parseWebhookEvents: parseModusignWebhookEvents,
}
