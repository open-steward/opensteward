import { timingSafeEqual } from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Track-POD webhook verification.
 *
 * Track-POD signs each webhook delivery by sending the webhook secret
 * verbatim in the `X-TRACK-POD-TOKEN` request header. Verification is a
 * constant-time equality check between the received header value and the
 * secret configured in the Track-POD webhook endpoint settings.
 *
 * Reference: https://track-pod.freshdesk.com/support/solutions/articles/103000049842
 */
export function verifyWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false

  const token =
    headers['x-track-pod-token'] ??
    headers['X-TRACK-POD-TOKEN'] ??
    headers['X-Track-Pod-Token'] ??
    ''

  if (!token) return false

  try {
    const a = Buffer.from(token)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Parse a Track-POD webhook payload into canonical WebhookEvents.
 *
 * Track-POD webhook payload structure:
 *   {
 *     "metadata": {
 *       "Event": "OrderUpdated",
 *       "Date": "2026-01-15T09:30:00Z"
 *     },
 *     "data": { ... order or route fields ... }
 *   }
 *
 * Supported event types:
 *   OrderCreated, OrderUpdated, OrderDeleted, OrderStatusUpdated,
 *   OrderStatusUpdatedPODReady, OrderRescheduled, OrderFeedbackSubmitted,
 *   OrderLoadStatusUpdated, RouteCreated, RouteUpdated, RouteDeleted,
 *   RouteStarted, RouteClosed, RouteOptimized, RouteUpdatedETARecalculated,
 *   RouteLoadStatusUpdated, VehicleCheckCompleted
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const metadata = payload['metadata'] as Record<string, unknown> | undefined
  const data = payload['data'] as Record<string, unknown> | undefined

  const eventType = String(metadata?.['Event'] ?? payload['Event'] ?? '')
  if (!eventType) return []

  type CanonicalResource = WebhookEvent['resourceType']
  type CanonicalAction = WebhookEvent['action']

  const lower = eventType.toLowerCase()

  let resourceType: CanonicalResource
  let action: CanonicalAction

  if (lower.startsWith('order')) {
    resourceType = 'order'
    if (lower.includes('created')) {
      action = 'created'
    } else if (lower.includes('deleted')) {
      action = 'deleted'
    } else if (lower.includes('cancelled') || lower.includes('canceled')) {
      action = 'cancelled'
    } else {
      action = 'updated'
    }
  } else if (lower.startsWith('route')) {
    resourceType = 'shipment'
    if (lower.includes('created')) {
      action = 'created'
    } else if (lower.includes('deleted')) {
      action = 'deleted'
    } else {
      action = 'updated'
    }
  } else if (lower.startsWith('vehicle')) {
    resourceType = 'carrier'
    action = 'updated'
  } else {
    resourceType = 'order'
    action = 'updated'
  }

  const body = data ?? payload
  const resourceId =
    (body['Id'] != null ? String(body['Id']) : undefined) ??
    (body['Number'] != null ? String(body['Number']) : undefined) ??
    (body['TrackId'] != null ? String(body['TrackId']) : undefined) ??
    undefined

  return [
    {
      platform: 'track-pod',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload: body,
    },
  ]
}

export const trackPodWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
