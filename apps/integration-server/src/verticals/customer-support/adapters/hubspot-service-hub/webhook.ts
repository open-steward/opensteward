/**
 * HubSpot Service Hub webhook verification + parsing.
 *
 * Signature version v3 (recommended):
 *   Header: X-HubSpot-Signature-v3  (Base64-encoded HMAC-SHA256)
 *   Header: X-HubSpot-Request-Timestamp  (ms since epoch)
 *   Signed payload: requestMethod + requestUri + requestBody + timestamp
 *
 * Signature version v1 (legacy, also supported):
 *   Header: X-HubSpot-Signature  (hex SHA-256 — plain hash, NOT HMAC)
 *   Signed payload: clientSecret + requestBody
 *
 * Reject webhooks where |now - timestamp| > 5 minutes (replay protection).
 *
 * Docs: https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000

/**
 * Verify a HubSpot webhook signature.
 *
 * @param payload    - Raw request body as a Buffer.
 * @param headers    - Request headers (lowercase keys).
 * @param secret     - App client secret (for v1) or app secret (for v3 HMAC).
 * @param requestUri - Full request URL used in v3 signed payload.
 *                     Callers should inject the real URL; defaults to ''.
 */
export function verifyHubspotWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
  requestUri = '',
): boolean {
  const requestMethod = 'POST'
  try {
    const sigV3 = headers['x-hubspot-signature-v3'] ?? headers['X-HubSpot-Signature-v3']
    const tsHeader = headers['x-hubspot-request-timestamp'] ?? headers['X-HubSpot-Request-Timestamp']

    if (sigV3 && tsHeader) {
      const ts = parseInt(tsHeader, 10)
      if (Number.isNaN(ts)) return false
      if (Math.abs(Date.now() - ts) > MAX_TIMESTAMP_SKEW_MS) return false

      // v3: HMAC-SHA256(clientSecret, requestMethod + requestUri + body + timestamp)
      const signed = `${requestMethod}${requestUri}${payload.toString('utf8')}${tsHeader}`
      const expected = createHmac('sha256', secret).update(signed, 'utf8').digest('base64')
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(sigV3.trim(), 'utf8')
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    }

    // Fall back to v1: plain SHA-256(clientSecret + body), hex-encoded (NOT HMAC)
    const sigV1 = headers['x-hubspot-signature'] ?? headers['X-HubSpot-Signature']
    if (sigV1) {
      const signed = secret + payload.toString('utf8')
      const expected = createHash('sha256').update(signed, 'utf8').digest('hex')
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(sigV1.trim(), 'utf8')
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    }

    return false
  } catch {
    return false
  }
}

/**
 * HubSpot webhook event types for CRM object subscriptions.
 * Each item in the payload array has: eventId, subscriptionType, objectId, propertyName, etc.
 *
 * Subscription types: ticket.creation, ticket.deletion, ticket.propertyChange,
 *   contact.creation, contact.deletion, contact.propertyChange
 */
const SUBSCRIPTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'ticket.creation':       { resourceType: 'tickets',  action: 'created' },
  'ticket.deletion':       { resourceType: 'tickets',  action: 'deleted' },
  'ticket.propertyChange': { resourceType: 'tickets',  action: 'updated' },
  'contact.creation':      { resourceType: 'contacts', action: 'created' },
  'contact.deletion':      { resourceType: 'contacts', action: 'deleted' },
  'contact.propertyChange':{ resourceType: 'contacts', action: 'updated' },
  'conversation.creation': { resourceType: 'messages', action: 'created' },
  'conversation.newMessage':{ resourceType: 'messages', action: 'commented' },
}

function mapStatus(propertyName: string | undefined, propertyValue: string | undefined): WebhookAction | undefined {
  if (propertyName !== 'hs_pipeline_stage') return undefined
  if (propertyValue === '4') return 'resolved'
  if (propertyValue === 'closed') return 'closed'
  return undefined
}

export function parseHubspotWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // HubSpot sends an array of event objects
  const events = Array.isArray(payload) ? payload : [payload]
  const out: WebhookEvent[] = []

  for (const evt of events) {
    const e = evt as Record<string, unknown>
    const subscriptionType = String(e['subscriptionType'] ?? '')
    const objectId = String(e['objectId'] ?? '')
    const eventId = String(e['eventId'] ?? e['portalId'] ?? '')
    const propertyName = e['propertyName'] as string | undefined
    const propertyValue = e['propertyValue'] as string | undefined

    const mapped = SUBSCRIPTION_MAP[subscriptionType] ?? {
      resourceType: 'unknown' as WebhookResourceType,
      action: 'unknown' as WebhookAction,
    }

    // Refine action for status-change events
    let action = mapped.action
    const statusAction = mapStatus(propertyName, propertyValue)
    if (statusAction) action = statusAction

    out.push({
      id: eventId ? `hubspot-service-hub:${eventId}` : undefined,
      platform: 'hubspot-service-hub',
      type: subscriptionType,
      resourceType: mapped.resourceType,
      action,
      resourceId: objectId,
      ticketId: mapped.resourceType === 'messages' ? undefined : objectId,
      payload: e,
    })
  }

  return out
}

export const HubspotServiceHubWebhookHandler: WebhookHandler = {
  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    // Attempt to read the request URI from well-known forwarded headers so
    // that v3 HMAC validation signs over the correct URL. Callers can also
    // invoke verifyHubspotWebhook directly and pass requestUri explicitly.
    const requestUri =
      headers['x-forwarded-url'] ??
      headers['x-original-url'] ??
      headers['x-request-url'] ??
      ''
    return verifyHubspotWebhook(payload, headers, secret, requestUri)
  },
  parseWebhookEvents: parseHubspotWebhookEvents,
}
