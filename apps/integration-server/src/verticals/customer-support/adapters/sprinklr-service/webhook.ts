/**
 * Sprinklr Service webhook verification + parsing.
 *
 * Sprinklr signs webhook payloads with HMAC-SHA256 using a pre-shared key
 * and delivers the hex-encoded signature in the `X-Hub-Signature` header.
 *
 * Docs: https://dev.sprinklr.com/sprinklr-webhooks
 *       https://www.sprinklr.com/help/articles/platform-modules/create-and-manage-webhook-subscription-in-sprinklr/
 *
 * Supported event entity types: Case, Message, User, Contact, Profile, Campaign
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER_CANDIDATES = ['x-hub-signature-256', 'x-hub-signature']

/**
 * Verify a Sprinklr webhook request.
 * The signature is HMAC-SHA256(preSharedKey, rawBody) encoded as hex.
 */
export function verifySprinklrWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = SIG_HEADER_CANDIDATES
      .map((h) => headers[h])
      .find(Boolean)
    if (!provided) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Map Sprinklr event type strings to canonical resource/action pairs.
 * Sprinklr event types follow the pattern: CASE_CREATED, CASE_UPDATED,
 * CASE_CLOSED, MESSAGE_RECEIVED, MESSAGE_SENT, PROFILE_CREATED, etc.
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  // Case events
  CASE_CREATED:   { resourceType: 'tickets', action: 'created' },
  CASE_UPDATED:   { resourceType: 'tickets', action: 'updated' },
  CASE_ASSIGNED:  { resourceType: 'tickets', action: 'assigned' },
  CASE_CLOSED:    { resourceType: 'tickets', action: 'closed' },
  CASE_RESOLVED:  { resourceType: 'tickets', action: 'resolved' },
  CASE_REOPENED:  { resourceType: 'tickets', action: 'reopened' },
  CASE_DELETED:   { resourceType: 'tickets', action: 'deleted' },
  // Message events
  MESSAGE_RECEIVED:       { resourceType: 'messages', action: 'created' },
  MESSAGE_SENT:           { resourceType: 'messages', action: 'created' },
  MESSAGE_PUBLISHED:      { resourceType: 'messages', action: 'created' },
  MESSAGE_UPDATED:        { resourceType: 'messages', action: 'updated' },
  MESSAGE_DELETED:        { resourceType: 'messages', action: 'deleted' },
  // Contact / profile events
  PROFILE_CREATED:        { resourceType: 'contacts', action: 'created' },
  PROFILE_UPDATED:        { resourceType: 'contacts', action: 'updated' },
  PROFILE_DELETED:        { resourceType: 'contacts', action: 'deleted' },
  // User events
  USER_CREATED:           { resourceType: 'users', action: 'created' },
  USER_UPDATED:           { resourceType: 'users', action: 'updated' },
}

export function parseSprinklrWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Sprinklr sends: { eventType, entityId, caseId, data: {...} }
  const eventType = String(payload['eventType'] ?? payload['type'] ?? '')
  const entityId = String(payload['entityId'] ?? payload['id'] ?? '')
  // caseId may be present on message events
  const caseId = payload['caseId'] != null ? String(payload['caseId']) : undefined

  const mapped = ACTION_MAP[eventType.toUpperCase()] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  const ticketId = mapped.resourceType === 'messages' ? (caseId ?? entityId) : undefined

  return [
    {
      id: `sprinklr-service:${eventType}:${entityId}`,
      platform: 'sprinklr-service',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: entityId,
      ticketId,
      payload,
    },
  ]
}

export const SprinklrServiceWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySprinklrWebhook,
  parseWebhookEvents: parseSprinklrWebhookEvents,
}
