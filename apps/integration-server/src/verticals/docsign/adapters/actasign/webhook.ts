/**
 * actaSIGN webhook verification + event parsing.
 *
 * actaSIGN delivers signed real-time notifications when a signing process
 * changes state (a document is signed, rejected, or expired). Deliveries are
 * signed with an HMAC-SHA256 of the raw request body using the per-endpoint
 * signing secret; the hex digest ships in the `X-Actasign-Signature` header.
 *
 * The JSON body carries the event `type` (e.g. `signing_process.completed`),
 * the affected `signing_process` id, and the `signatory` id when the event is
 * signer-scoped.
 *
 * Docs: https://www.actasign.swiss/en/product (Webhooks for real-time notifications)
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADER = 'x-actasign-signature'

export function verifyActasignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = Object.entries(headers).find(
      ([k]) => k.toLowerCase() === SIG_HEADER,
    )?.[1]
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(provided.trim().toLowerCase(), 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'signing_process.created': { resourceType: 'envelopes', action: 'created' },
  'signing_process.sent': { resourceType: 'envelopes', action: 'sent' },
  'signing_process.viewed': { resourceType: 'envelopes', action: 'viewed' },
  'signing_process.completed': { resourceType: 'envelopes', action: 'completed' },
  'signing_process.signed': { resourceType: 'envelopes', action: 'completed' },
  'signing_process.rejected': { resourceType: 'envelopes', action: 'declined' },
  'signing_process.declined': { resourceType: 'envelopes', action: 'declined' },
  'signing_process.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'signing_process.expired': { resourceType: 'envelopes', action: 'expired' },
  'signatory.viewed': { resourceType: 'signers', action: 'viewed' },
  'signatory.signed': { resourceType: 'signers', action: 'signed' },
  'signatory.rejected': { resourceType: 'signers', action: 'declined' },
  'signatory.declined': { resourceType: 'signers', action: 'declined' },
}

export function parseActasignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? payload['event'] ?? '')
  const occurredAt = String(payload['created_at'] ?? payload['timestamp'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const signingProcess =
    (data['signing_process'] as Record<string, unknown> | undefined) ?? {}
  const signatory = (data['signatory'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(
    signingProcess['id'] ?? data['signing_process_id'] ?? data['id'] ?? '',
  )
  const signatoryId = String(signatory['id'] ?? data['signatory_id'] ?? '')

  const { resourceType, action } = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId = resourceType === 'signers' ? signatoryId || envelopeId : envelopeId

  return [
    {
      id: `actasign:${type}:${envelopeId}:${signatoryId}:${occurredAt}`,
      platform: 'actasign',
      type,
      resourceType,
      action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const ActasignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyActasignWebhook,
  parseWebhookEvents: parseActasignWebhookEvents,
}
