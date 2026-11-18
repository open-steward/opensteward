/**
 * Proof Webhooks V2 verification + event parsing.
 *
 * Proof signs each delivery with an HMAC-SHA256 of the raw request body
 * using the webhook's signing key (the API key used to create the
 * subscription by default, or a custom `signing_key`). The hex digest ships
 * in the `X-Notarize-Signature` header. Compare with `timingSafeEqual`.
 *
 * Each delivery is a single event: `{ event, data, date_occurred }` where
 * `data` carries `transaction_id` (and signer details for signer events).
 *
 * Docs: https://dev.proof.com/docs/webhooks-v2
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'
import { WEBHOOK_SIGNATURE_HEADER } from './constants'

export function verifyProofWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[WEBHOOK_SIGNATURE_HEADER]
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(provided, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Classify a Proof event name into a canonical resourceType + action.
 * Events are dotted, e.g. `transaction.completed`, `transaction.sent_to_signer`,
 * `transaction.document.processed`, `transaction.signer.kba_passed`.
 */
function classify(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const e = event.toLowerCase()

  if (e.includes('.document.')) {
    if (e.endsWith('.upload')) return { resourceType: 'documents', action: 'created' }
    return { resourceType: 'documents', action: 'updated' }
  }
  if (e.includes('.signer.')) {
    return { resourceType: 'signers', action: 'updated' }
  }

  // transaction.* lifecycle
  if (e.endsWith('.created')) return { resourceType: 'envelopes', action: 'created' }
  if (e.endsWith('.updated') || e.endsWith('.reviewed') || e.endsWith('.held_for_review'))
    return { resourceType: 'envelopes', action: 'updated' }
  if (e.endsWith('.completed') || e.endsWith('.partially_completed') || e.endsWith('.released'))
    return { resourceType: 'envelopes', action: 'completed' }
  if (e.endsWith('.completed_with_rejections'))
    return { resourceType: 'envelopes', action: 'completed' }
  if (e.endsWith('.declined')) return { resourceType: 'envelopes', action: 'declined' }
  if (e.endsWith('.expired')) return { resourceType: 'envelopes', action: 'expired' }
  if (e.endsWith('.deleted') || e.endsWith('.recalled'))
    return { resourceType: 'envelopes', action: 'voided' }
  if (e.includes('.sent_to_') || e.endsWith('.sent'))
    return { resourceType: 'envelopes', action: 'sent' }
  if (e.startsWith('transaction.')) return { resourceType: 'envelopes', action: 'updated' }

  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseProofWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  // date_occurred is nested inside data per the Webhooks V2 schema; fall back
  // to top-level for any legacy deliveries that included it there.
  const dateOccurred = String(data['date_occurred'] ?? payload['date_occurred'] ?? '')
  const transactionId = String(data['transaction_id'] ?? data['id'] ?? '')
  const signerId = String(data['signer_id'] ?? '')
  const documentId = String(data['document_id'] ?? '')
  const { resourceType, action } = classify(event)
  const resourceId =
    resourceType === 'signers'
      ? signerId || transactionId
      : resourceType === 'documents'
        ? documentId || transactionId
        : transactionId
  return [
    {
      id: `proof:${event}:${transactionId}:${signerId}:${dateOccurred}`,
      platform: 'proof',
      type: event,
      resourceType,
      action,
      resourceId,
      envelopeId: transactionId || undefined,
      payload,
    },
  ]
}

export const ProofWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyProofWebhook,
  parseWebhookEvents: parseProofWebhookEvents,
}
