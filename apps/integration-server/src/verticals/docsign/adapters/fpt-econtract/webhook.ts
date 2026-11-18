/**
 * FPT.eContract callback (webhook) verification + event parsing.
 *
 * FPT.eContract pushes contract status-change callbacks to a partner-
 * registered URL. Each delivery is signed with an HMAC-SHA256 of the raw
 * request body using the partner's callback secret; the signature ships
 * hex-encoded in the `x-econtract-signature` header. We compare with
 * `timingSafeEqual` and also accept a base64-encoded form for robustness.
 *
 * The JSON body carries an `event`/`action` code and a `data` object with
 * the contract id (and, for recipient events, the recipient id).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADER = 'x-econtract-signature'

export function verifyFptEcontractWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()]
    if (!provided) return false
    const expectedHex = createHmac('sha256', secret).update(payload).digest('hex')
    const expectedB64 = createHmac('sha256', secret).update(payload).digest('base64')
    for (const expected of [expectedHex, expectedB64]) {
      const a = Buffer.from(provided)
      const b = Buffer.from(expected)
      if (a.length === b.length && timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  draft: 'created',
  sent: 'sent',
  processing: 'sent',
  pending: 'sent',
  delivered: 'delivered',
  viewed: 'viewed',
  opened: 'viewed',
  signed: 'signed',
  completed: 'completed',
  finished: 'completed',
  rejected: 'declined',
  declined: 'declined',
  cancelled: 'voided',
  canceled: 'voided',
  voided: 'voided',
  revoked: 'voided',
  expired: 'expired',
  updated: 'updated',
}

function classify(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = event.toLowerCase()
  // FPT events are dotted/underscored, e.g. `contract.signed`, `recipient_signed`.
  const tail = lowered.split(/[._-]/).pop() ?? lowered
  const action = ACTION_MAP[tail] ?? 'updated'
  if (lowered.includes('recipient') || lowered.includes('signer')) {
    return { resourceType: 'signers', action }
  }
  if (lowered.includes('template')) {
    return { resourceType: 'templates', action }
  }
  if (lowered.includes('contract') || lowered.includes('envelope')) {
    return { resourceType: 'envelopes', action }
  }
  return { resourceType: 'unknown', action }
}

export function parseFptEcontractWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['action'] ?? payload['type'] ?? '')
  const occurredAt = String(payload['timestamp'] ?? payload['createdAt'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const contractId = String(data['contractId'] ?? data['id'] ?? '')
  const recipientId = String(data['recipientId'] ?? '')
  const templateId = String(data['templateId'] ?? '')
  const { resourceType, action } = classify(event)
  const resourceId =
    resourceType === 'signers'
      ? recipientId || contractId
      : resourceType === 'templates'
        ? templateId || contractId
        : contractId
  return [
    {
      id: `fpt-econtract:${event}:${resourceId}:${occurredAt}`,
      platform: 'fpt-econtract',
      type: event || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: contractId || undefined,
      payload,
    },
  ]
}

export const FptEcontractWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFptEcontractWebhook,
  parseWebhookEvents: parseFptEcontractWebhookEvents,
}
