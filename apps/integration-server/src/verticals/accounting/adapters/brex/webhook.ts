/**
 * Brex webhook verification and event parsing.
 *
 * Verification (HMAC-SHA256, Svix-style):
 *   signed_content = `${webhook_id}.${webhook_timestamp}.${raw_body}`
 *   key            = base64_decode(secret)
 *   signature      = hmac_sha256(key, signed_content)   → compare against Webhook-Signature header
 *
 * The Webhook-Signature header contains one or more space-delimited entries of the form
 * `v1,<base64_signature>`.  The implementation below checks all entries and passes if any match.
 *
 * Signing secrets are fetched via GET /v1/webhooks/secrets (a list of active secrets returned
 * during key rotation; the adapter uses the single secret supplied in the platform config).
 *
 * Docs: https://developer.brex.com/docs/webhooks/
 */

import crypto from 'node:crypto'
import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Brex webhook payload types ────────────────────────────────────────────────

type BrexWebhookPayload = {
  event_type: string   // e.g. "EXPENSE_UPDATED", "TRANSFER_CREATED", "VENDOR_CREATED"
  event_id?: string
  created_at?: string
  [key: string]: unknown
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(eventType: string): WebhookResourceType {
  // Brex event_type values follow the pattern RESOURCE_ACTION (SCREAMING_SNAKE_CASE)
  const prefix = eventType.split('_').slice(0, -1).join('_')
  const map: Record<string, WebhookResourceType> = {
    EXPENSE: 'transaction',
    TRANSFER: 'transaction',
    CARD_TRANSACTION: 'transaction',
    CASH_TRANSACTION: 'transaction',
    VENDOR: 'contact',
    ACCOUNT: 'account',
    USER: 'contact',
    CARD: 'account',
  }
  return map[prefix] ?? 'unknown'
}

function mapAction(eventType: string): WebhookAction {
  const suffix = eventType.split('_').pop()?.toUpperCase() ?? ''
  if (suffix === 'CREATED') return 'created'
  if (suffix === 'UPDATED' || suffix === 'APPROVED' || suffix === 'SUBMITTED') return 'updated'
  if (suffix === 'DELETED' || suffix === 'CANCELLED') return 'deleted'
  return 'unknown'
}

// ── Signature verification ─────────────────────────────────────────────────

function verifyBrexSignature(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const webhookId = headers['webhook-id'] ?? ''
    const webhookTimestamp = headers['webhook-timestamp'] ?? ''
    const signatureHeader = headers['webhook-signature'] ?? ''

    if (!webhookId || !webhookTimestamp || !signatureHeader) return false

    // Replay protection: reject if timestamp is more than 5 minutes old
    const tsMs = Number(webhookTimestamp) * 1000
    if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false

    const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`
    const key = Buffer.from(secret, 'base64')
    const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64')

    // Header may contain multiple signatures: "v1,<sig1> v1,<sig2>"
    const signatures = signatureHeader.split(' ')
    return signatures.some((entry) => {
      const [, sig] = entry.split(',')
      if (!sig) return false
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    })
  } catch {
    return false
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const brexWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const rawBody = Buffer.isBuffer(payload)
      ? payload.toString('utf8')
      : typeof payload === 'string'
        ? payload
        : JSON.stringify(payload)
    return verifyBrexSignature(rawBody, headers, secret)
  },

  parseWebhookEvents(payload) {
    const body = payload as BrexWebhookPayload
    if (!body.event_type) return []

    const resourceType = mapResourceType(body.event_type)
    const action = mapAction(body.event_type)

    const event: WebhookEvent = {
      platform: 'brex',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId: body.event_id ?? '',
      payload,
    }

    return [event]
  },
}
