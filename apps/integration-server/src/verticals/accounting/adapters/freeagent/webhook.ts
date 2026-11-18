/**
 * FreeAgent webhook verification and parsing.
 *
 * Verification: HMAC-SHA256 of raw body using the FreeAgent webhook secret.
 * Signature arrives hex-encoded with a `sha256=` prefix in `x-freeagent-signature`.
 *
 * Docs: https://dev.freeagent.com/docs/webhooks
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { verifyHmacSha256, stripPrefix } from '../../webhook'

// ── FreeAgent payload types ───────────────────────────────────────────────────

type FreeAgentEvent = {
  event_type: string    // e.g. "invoice_created", "contact_updated"
  affected_url?: string // resource URL
  event?: string        // sometimes nested here
}

type FreeAgentWebhookPayload = {
  events?: FreeAgentEvent[]
  event_type?: string
  affected_url?: string
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapFromEventType(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lower = eventType.toLowerCase()

  let resourceType: WebhookResourceType = 'unknown'
  if (lower.includes('invoice')) resourceType = 'invoice'
  else if (lower.includes('bill') || lower.includes('expense')) resourceType = 'expense'
  else if (lower.includes('contact')) resourceType = 'contact'
  else if (lower.includes('account')) resourceType = 'account'
  else if (lower.includes('transaction')) resourceType = 'transaction'
  else if (lower.includes('journal')) resourceType = 'journal'

  let action: WebhookAction = 'unknown'
  if (lower.endsWith('_created') || lower.endsWith('_create')) action = 'created'
  else if (lower.endsWith('_updated') || lower.endsWith('_update')) action = 'updated'
  else if (lower.endsWith('_deleted') || lower.endsWith('_delete') || lower.endsWith('_destroyed'))
    action = 'deleted'

  return { resourceType, action }
}

function extractResourceId(url: string | undefined): string {
  if (!url) return ''
  const parts = url.split('/')
  return parts[parts.length - 1] ?? ''
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const freeagentWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const raw = headers['x-freeagent-signature'] ?? ''
    const sig = stripPrefix(raw, 'sha256=')
    return verifyHmacSha256(payload, secret, sig, 'hex')
  },

  parseWebhookEvents(payload) {
    const body = payload as FreeAgentWebhookPayload

    const rawEvents: FreeAgentEvent[] =
      Array.isArray(body.events) && body.events.length > 0
        ? body.events
        : body.event_type
          ? [{ event_type: body.event_type, affected_url: body.affected_url }]
          : []

    return rawEvents.map((ev): WebhookEvent => {
      const { resourceType, action } = mapFromEventType(ev.event_type)
      const resourceId = extractResourceId(ev.affected_url)
      return {
        platform: 'freeagent',
        type: `${resourceType}.${action}`,
        resourceType,
        action,
        resourceId,
        payload,
      }
    })
  },
}
