/**
 * lemlist webhook handling.
 *
 * Signature verification:
 *   lemlist does NOT use HMAC signatures. When you register a webhook with an
 *   optional `secret`, lemlist echoes that secret back as a `secret` field in
 *   the JSON body of every webhook POST. Verification is a timing-safe
 *   comparison of the body `secret` field against the registered secret.
 *
 * If no secret was configured at registration time, the `secret` field will be
 * absent from the payload — we accept the event in that case (the caller must
 * decide whether to require a secret).
 *
 * Payload shape (per event):
 *   { _id, type, teamId, createdAt, leadId, leadEmail,
 *     sendUserId, sendUserEmail, campaignId, sequenceId,
 *     secret?, ... }
 */

import { timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'

/** Map lemlist event type strings to canonical resource.action strings. */
function canonicalType(lemlistType: string): string {
  if (!lemlistType) return 'unknown.unknown'
  const lower = lemlistType.toLowerCase()
  if (lower.includes('interested')) return 'contact.updated'
  if (lower.includes('replied')) return 'contact.updated'
  if (lower.includes('clicked') || lower.includes('opened')) return 'contact.updated'
  if (lower.includes('bounced') || lower.includes('unsubscribe')) return 'contact.deleted'
  if (lower.includes('email') || lower.includes('linkedin') || lower.includes('sms')) return 'activity.created'
  return 'unknown.unknown'
}

/**
 * Verify a lemlist webhook by comparing the `secret` field in the JSON body
 * against the registered secret using a timing-safe comparison.
 *
 * Returns true when:
 *   - no secret was configured (body `secret` field is absent) — open webhook
 *   - the body `secret` field matches the registered `secret` argument
 *
 * Returns false on mismatch or any comparison error.
 */
export function verifyWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  // Parse the raw payload to extract the echoed secret field.
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
  } catch {
    return false
  }

  const bodySecret = parsed['secret']

  // No secret registered on this webhook — accept unconditionally.
  if (bodySecret === undefined || bodySecret === null) return true

  // Both values must be strings for a meaningful comparison.
  if (typeof bodySecret !== 'string' || typeof secret !== 'string') return false

  try {
    return timingSafeEqual(Buffer.from(secret), Buffer.from(bodySecret))
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const raw = payload as Record<string, unknown>
  const id = raw['_id'] ? String(raw['_id']) : undefined
  const type = typeof raw['type'] === 'string' ? raw['type'] : 'unknown'
  const leadId = raw['leadId'] ? String(raw['leadId']) : ''

  if (!leadId && !id) return []

  return [
    {
      id,
      platform: 'lemlist',
      type: canonicalType(type),
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: leadId || id || '',
      tenantId: raw['teamId'] ? String(raw['teamId']) : undefined,
      payload: raw,
    },
  ]
}

export const lemlistWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
