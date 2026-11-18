/**
 * Zoho Sign webhook verification + event parsing.
 *
 * Zoho Sign delivers JSON with an HMAC-SHA256 of the raw body using the
 * webhook secret. The signature ships as `X-ZohoSign-Webhook-Signature`
 * (hex-encoded).
 *
 * Docs: https://www.zoho.com/sign/api/webhooks.html
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = [
  'x-zohosign-webhook-signature',
  'x-zoho-webhook-signature',
]

export function verifyZohoSignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const expectedBuf = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const providedBuf = Buffer.from(provided.trim(), 'utf8')
      if (providedBuf.length !== expectedBuf.length) continue
      if (timingSafeEqual(providedBuf, expectedBuf)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookAction> = {
  RequestSent: 'sent',
  RequestViewed: 'viewed',
  RequestSigned: 'signed',
  RequestCompleted: 'completed',
  RequestDeclined: 'declined',
  RequestRecalled: 'voided',
  RequestExpired: 'expired',
  RequestCreated: 'created',
  RequestDeleted: 'deleted',
  ActionCompleted: 'signed',
  ActionDeclined: 'declined',
  ActionViewed: 'viewed',
  ActionDelegated: 'updated',
}

function classify(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  if (event.startsWith('Request')) {
    return { resourceType: 'envelopes', action: ACTION_MAP[event] ?? 'updated' }
  }
  if (event.startsWith('Action')) {
    return { resourceType: 'signers', action: ACTION_MAP[event] ?? 'updated' }
  }
  if (event.startsWith('Template')) {
    return { resourceType: 'templates', action: ACTION_MAP[event] ?? 'updated' }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseZohoSignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const notifications = (payload['notifications'] as Record<string, unknown> | undefined) ?? payload
  const operationType = String(
    notifications['operation_type'] ?? notifications['operationType'] ?? payload['operation_type'] ?? '',
  )
  const requests = (notifications['requests'] as Record<string, unknown> | undefined) ?? {}
  const requestId = String(
    requests['request_id'] ?? notifications['request_id'] ?? payload['request_id'] ?? '',
  )
  const actionId = String(
    notifications['action_id'] ?? payload['action_id'] ?? '',
  )
  const { resourceType, action } = classify(operationType)
  const resourceId =
    resourceType === 'signers' ? actionId || requestId : requestId
  return [
    {
      id: `zoho-sign:${operationType}:${requestId}:${actionId}`,
      platform: 'zoho-sign',
      type: operationType || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: requestId || undefined,
      payload,
    },
  ]
}

export const ZohoSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyZohoSignWebhook,
  parseWebhookEvents: parseZohoSignWebhookEvents,
}
