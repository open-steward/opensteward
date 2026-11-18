/**
 * Leegality webhook verification + event parsing.
 *
 * Leegality POSTs the document payload (the same shape as the Details API
 * response, plus a `signType` per invitee) to the configured webhook URL.
 * Authenticity is verified via the `mac` field IN THE BODY — `mac` is the
 * HMAC-SHA1 of `documentId` keyed by the account Private Salt. The encoding
 * is not pinned in the docs, so we accept either hex or base64.
 *
 * Docs: https://support.leegality.com/portal/en/kb/articles/api-settings
 *       (API Settings → webhook authentication)
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

function safeEqualEncoded(provided: string, expected: Buffer, encoding: BufferEncoding): boolean {
  try {
    const a = Buffer.from(provided, encoding)
    if (a.length !== expected.length) return false
    return timingSafeEqual(a, expected)
  } catch {
    return false
  }
}

/**
 * `secret` is the account Private Salt. The signed value is `documentId`,
 * read from the parsed JSON body. We recompute HMAC-SHA1 and compare
 * against the `mac` field, trying hex first then base64.
 */
export function verifyLeegalityWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const documentId = body['documentId']
    const provided = body['mac']
    if (typeof documentId !== 'string' || typeof provided !== 'string' || !provided) return false
    const expected = createHmac('sha1', secret).update(documentId).digest()
    const normalized = provided.startsWith('sha1=') ? provided.slice('sha1='.length) : provided
    return (
      safeEqualEncoded(normalized, expected, 'hex') ||
      safeEqualEncoded(normalized, expected, 'base64')
    )
  } catch {
    return false
  }
}

interface LeegalityWebhookInvitee {
  signed?: boolean
  rejected?: boolean
  expired?: boolean
  signUrl?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

/**
 * Leegality does not send a discrete event-type field — it posts the
 * current document snapshot. We classify the delivery from the document +
 * invitee booleans into the canonical webhook resource/action pair.
 */
function classify(
  body: Record<string, unknown>,
  invitees: LeegalityWebhookInvitee[],
): { resourceType: WebhookResourceType; action: WebhookAction } {
  const status = String(body['status'] ?? '').toLowerCase()
  if (status === 'completed' || status === 'signed') {
    return { resourceType: 'envelopes', action: 'completed' }
  }
  if (status === 'expired') return { resourceType: 'envelopes', action: 'expired' }
  if (invitees.some((i) => i.rejected)) {
    return { resourceType: 'signers', action: 'declined' }
  }
  if (invitees.some((i) => i.signed)) {
    return { resourceType: 'signers', action: 'signed' }
  }
  if (invitees.some((i) => i.expired)) {
    return { resourceType: 'envelopes', action: 'expired' }
  }
  return { resourceType: 'envelopes', action: 'sent' }
}

export function parseLeegalityWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const documentId = String(payload['documentId'] ?? '')
  const invitees = Array.isArray(payload['requests'])
    ? (payload['requests'] as LeegalityWebhookInvitee[])
    : []
  const { resourceType, action } = classify(payload, invitees)
  return [
    {
      id: `leegality:${documentId}:${action}`,
      platform: 'leegality',
      type: `document.${action}`,
      resourceType,
      action,
      resourceId: documentId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const LeegalityWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyLeegalityWebhook,
  parseWebhookEvents: parseLeegalityWebhookEvents,
}
