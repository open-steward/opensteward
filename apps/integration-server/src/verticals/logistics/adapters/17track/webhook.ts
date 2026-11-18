import { createHash, timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * 17TRACK webhook signature verification.
 *
 * The platform signs each push notification using SHA256 over the concatenation:
 *   <raw JSON body string> + "/" + <API secret key>
 *
 * The resulting hex digest is sent in the `sign` request header.
 *
 * Reference: https://help.17track.net/hc/en-us/articles/37573146087321
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['sign'] ?? ''
  if (!signature) return false

  const bodyStr = payload.toString('utf8')
  const expected = createHash('sha256')
    .update(`${bodyStr}/${secret}`, 'utf8')
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8'),
    )
  } catch {
    return false
  }
}

/**
 * Parse a 17TRACK webhook push notification into canonical WebhookEvents.
 *
 * Supported event types:
 *   TRACKING_UPDATED — package status changed
 *   TRACKING_STOPPED — automatic monitoring ceased
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = payload['data'] as Record<string, unknown> | undefined
  const accepted = (
    (data?.['accepted'] as unknown[] | undefined) ?? []
  ) as Array<Record<string, unknown>>

  type CanonicalAction = WebhookEvent['action']

  let action: CanonicalAction
  switch (event) {
    case 'TRACKING_UPDATED':
      action = 'updated'
      break
    case 'TRACKING_STOPPED':
      action = 'cancelled'
      break
    default:
      action = 'updated'
  }

  if (accepted.length === 0) {
    // Emit a single event for the whole payload when no accepted items
    return [
      {
        platform: '17track',
        type: event,
        resourceType: 'tracking_event',
        action,
        payload,
      },
    ]
  }

  return accepted.map((item) => ({
    platform: '17track',
    type: event,
    resourceType: 'tracking_event' as const,
    action,
    resourceId: item['number'] != null ? String(item['number']) : undefined,
    payload: item,
  }))
}

export const track17Webhook = {
  verifyWebhook,
  parseWebhookEvents,
}
