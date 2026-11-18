/**
 * Salt Edge callbacks (Account Information API v6).
 *
 * Salt Edge POSTs callbacks (success / fail / notify / destroy) to the URLs
 * configured in the client dashboard. Each request is signed: the `Signature`
 * header is a base64-encoded RSA-SHA256 signature of the string
 *
 *     `${callback_url}|${raw_post_body}`
 *
 * produced with Salt Edge's PRIVATE key. We verify it with Salt Edge's
 * PUBLIC key (a PEM string), which is the `secret` configured for this
 * connection. The signing-key version is reported in `Signature-key-version`.
 *
 * Docs: https://docs.saltedge.com/v6/#security-callbacks
 */
import { createVerify } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Map a Salt Edge callback "stage" / event name to a canonical action.
 * Callbacks are connection-level lifecycle events, so they all classify as
 * connection-data changes; the closest canonical resource is `customers`
 * (the connection's owner) since connections have no canonical resource.
 */
const ACTION_MAP: Record<string, WebhookAction> = {
  success: 'succeeded',
  fail: 'failed',
  failure: 'failed',
  destroy: 'deleted',
  notify: 'updated',
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  return {
    resourceType: 'customers',
    action: ACTION_MAP[eventType.toLowerCase()] ?? 'unknown',
  }
}

/**
 * Reconstruct the exact `callback_url` Salt Edge signed over. Salt Edge signs
 * the URL it was configured to call; we surface it from the forwarded headers
 * so the verifier can rebuild `callback_url|post_body`.
 */
function callbackUrlFromHeaders(headers: Record<string, string>): string {
  return (
    headers['x-callback-url'] ??
    headers['x-original-url'] ??
    headers['x-forwarded-url'] ??
    ''
  )
}

export function verifySaltEdgeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const signature = headers['signature'] ?? headers['Signature']
    if (!signature || !secret) return false
    const callbackUrl = callbackUrlFromHeaders(headers)
    const signedString = `${callbackUrl}|${payload.toString('utf8')}`
    const verifier = createVerify('RSA-SHA256')
    verifier.update(signedString, 'utf8')
    verifier.end()
    return verifier.verify(secret, signature, 'base64')
  } catch {
    return false
  }
}

export function parseSaltEdgeWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const meta = (payload['meta'] as Record<string, unknown> | undefined) ?? {}
  // Salt Edge does not carry the event name in the body; callers route by the
  // configured callback path (success/fail/notify/destroy) and pass it via the
  // `stage`/`event` data field when known.
  const eventType = String(data['stage'] ?? data['event'] ?? meta['event'] ?? 'notify')
  const resourceId = String(data['connection_id'] ?? data['customer_id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      platform: 'salt-edge',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const SaltEdgeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySaltEdgeWebhook,
  parseWebhookEvents: parseSaltEdgeWebhookEvents,
}
