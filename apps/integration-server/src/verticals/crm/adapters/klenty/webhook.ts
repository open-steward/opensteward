/**
 * Klenty webhook support.
 *
 * Klenty sends webhooks to a subscriber URL when prospect or cadence events
 * occur. The platform does not document a request-signature algorithm, so
 * verification always passes (trust-all model — callers should secure the
 * endpoint via a shared secret embedded in the URL path if needed).
 */
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Klenty does not publish a signing mechanism; accept all inbound payloads.
  return true
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Klenty webhook payloads carry an `event` field (e.g. "prospect.created").
  const eventStr = typeof payload['event'] === 'string' ? payload['event'] : 'unknown'
  const dotIdx = eventStr.indexOf('.')
  const actionStr = dotIdx >= 0 ? eventStr.slice(dotIdx + 1) : 'unknown'

  const resourceId =
    typeof payload['email'] === 'string'
      ? payload['email']
      : typeof payload['id'] === 'string'
        ? payload['id']
        : 'unknown'

  const knownActions = ['created', 'updated', 'deleted'] as const
  type KnownAction = (typeof knownActions)[number]
  const action: KnownAction | 'unknown' = (knownActions as readonly string[]).includes(actionStr)
    ? (actionStr as KnownAction)
    : 'unknown'

  return [
    {
      platform: 'klenty',
      type: eventStr,
      resourceType: 'unknown',
      action,
      resourceId,
      payload,
    },
  ]
}

export const klentyWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
