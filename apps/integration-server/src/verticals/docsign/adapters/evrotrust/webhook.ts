/**
 * Evrotrust e-signature callback parsing.
 *
 * Evrotrust POSTs a callback to the vendor's `urlCallback` whenever a
 * signing transaction reaches a terminal state (signed, rejected, expired,
 * failed, withdrawn, failed face recognition). The body is a small JSON
 * object:
 *
 *   { transactionID, status, rejectReason?, automatedSignError? }
 *
 * Evrotrust does NOT sign the callback — there is no HMAC/signature header
 * documented — so cryptographic verification is impossible. `verifyWebhook`
 * therefore performs only a shape check and accepts the delivery; deployments
 * that need stronger assurance should restrict the callback endpoint to
 * Evrotrust source IPs at the network layer.
 *
 * Docs: https://docs.evrotrust.com/reference/readydocument
 */
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'
import {
  STATUS_SIGNED,
  STATUS_REJECTED,
  STATUS_EXPIRED,
  STATUS_WITHDRAWN,
} from './constants'

export function verifyEvrotrustWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Evrotrust callbacks are unsigned; accept any well-formed JSON body.
  try {
    const parsed = JSON.parse(payload.toString('utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

function mapStatus(code: number): {
  type: string
  action: WebhookAction
} {
  switch (code) {
    case STATUS_SIGNED:
      return { type: 'document.signed', action: 'completed' }
    case STATUS_REJECTED:
      return { type: 'document.rejected', action: 'declined' }
    case STATUS_WITHDRAWN:
      return { type: 'document.withdrawn', action: 'voided' }
    case STATUS_EXPIRED:
      return { type: 'document.expired', action: 'expired' }
    default:
      return { type: `document.status.${code}`, action: 'updated' }
  }
}

export function parseEvrotrustWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const transactionId = String(payload['transactionID'] ?? '')
  const threadId = String(payload['threadID'] ?? '')
  const statusCode = Number(payload['status'] ?? 0)
  const { type, action } = mapStatus(statusCode)
  const resourceType: WebhookResourceType = 'documents'
  return [
    {
      id: `evrotrust:${type}:${transactionId || threadId}`,
      platform: 'evrotrust',
      type,
      resourceType,
      action,
      resourceId: transactionId || threadId,
      envelopeId: threadId || undefined,
      payload,
    },
  ]
}

export const EvrotrustWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyEvrotrustWebhook,
  parseWebhookEvents: parseEvrotrustWebhookEvents,
}
