/**
 * Flowmono webhook event parsing.
 *
 * Flowmono registers webhooks via POST /api/WebHook/createwebhookurl.
 * The platform delivers JSON payloads to the registered URL when signing
 * request events occur. The current Flowmono API (confirmed from
 * https://api.flowmono.com/swagger/v1/swagger.json) does not document a
 * cryptographic request-signing scheme (no HMAC secret / signature header),
 * so `verifyFlowmonoWebhook` always returns `true` — the caller is
 * responsible for restricting the webhook endpoint to Flowmono's IP ranges
 * or using mTLS.
 *
 * Event payloads carry the signing-request status change; we map the
 * `action` / `status` field to canonical WebhookAction and WebhookResourceType.
 *
 * Docs: https://www.flowmono.com/en-US/api/e-sign
 */

import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

/**
 * Flowmono does not sign webhook deliveries with a verifiable HMAC secret.
 * This function always returns `true`; network-level controls (IP allowlist /
 * mTLS) must be used to authenticate the source.
 */
export function verifyFlowmonoWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

const ACTION_MAP: Record<string, WebhookAction> = {
  sent: 'sent',
  viewed: 'viewed',
  signed: 'signed',
  completed: 'completed',
  declined: 'declined',
  voided: 'voided',
  expired: 'expired',
  created: 'created',
  updated: 'updated',
  cancelled: 'voided',
  reassigned: 'updated',
  reminded: 'updated',
}

function classify(action: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lower = action.toLowerCase()
  const mappedAction: WebhookAction = ACTION_MAP[lower] ?? 'updated'
  return { resourceType: 'envelopes', action: mappedAction }
}

export function parseFlowmonoWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  // Flowmono webhook body shape: { action, referenceNumber, clientReference, timestamp, ... }
  const action = String(payload['action'] ?? payload['status'] ?? payload['eventType'] ?? '')
  const referenceNumber = String(
    payload['referenceNumber'] ?? payload['signingRequestId'] ?? payload['id'] ?? '',
  )
  const clientReference = String(payload['clientReference'] ?? '')
  const timestamp = String(payload['timestamp'] ?? payload['eventDate'] ?? '')
  const { resourceType, mappedAction } = (() => {
    const r = classify(action)
    return { resourceType: r.resourceType, mappedAction: r.action }
  })()

  return [
    {
      id: `flowmono:${action}:${referenceNumber}:${timestamp}`,
      platform: 'flowmono',
      type: action || 'unknown',
      resourceType,
      action: mappedAction,
      resourceId: referenceNumber || clientReference,
      envelopeId: referenceNumber || undefined,
      payload,
    },
  ]
}

export const FlowmonoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFlowmonoWebhook,
  parseWebhookEvents: parseFlowmonoWebhookEvents,
}
