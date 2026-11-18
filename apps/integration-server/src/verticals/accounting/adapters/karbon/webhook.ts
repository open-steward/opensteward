/**
 * Karbon webhook parsing.
 *
 * Karbon publishes webhook events for contacts, work items, invoices, and
 * other entities.  Each payload contains:
 *   ResourcePermaKey  — platform-specific resource identifier
 *   ResourceType      — e.g. "Invoice", "Contact", "Work"
 *   ActionType        — e.g. "Create", "Update", "Delete"
 *   TimeStamp         — ISO 8601 string
 *
 * Karbon does not currently document a cryptographic signature mechanism for
 * webhook payloads; verifyWebhook therefore returns `true` unconditionally
 * (treat the endpoint as authenticated at the network layer / IP allowlist).
 *
 * Docs: https://developers.karbonhq.com/
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Karbon payload types ──────────────────────────────────────────────────────

type KarbonWebhookPayload = {
  ResourcePermaKey?: string
  ResourceType?: string
  ActionType?: string
  TimeStamp?: string
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(resourceType: string): WebhookResourceType {
  const map: Record<string, WebhookResourceType> = {
    invoice: 'invoice',
    contact: 'contact',
    organization: 'organization',
    work: 'unknown',
    note: 'unknown',
    notecomment: 'unknown',
    customfield: 'unknown',
    estimatesummary: 'unknown',
    integrationtask: 'unknown',
    user: 'unknown',
  }
  return map[resourceType.toLowerCase()] ?? 'unknown'
}

function mapAction(actionType: string): WebhookAction {
  const a = actionType.toLowerCase()
  if (a.includes('creat')) return 'created'
  if (a.includes('updat')) return 'updated'
  if (a.includes('delet') || a.includes('remov')) return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const karbonWebhook: WebhookHandler = {
  /**
   * No documented signature mechanism — accept all payloads.
   * Secure the endpoint at the network/IP level.
   */
  verifyWebhook(_payload, _headers, _secret) {
    return true
  },

  parseWebhookEvents(payload) {
    const body = payload as KarbonWebhookPayload
    const resourceType = mapResourceType(body.ResourceType ?? '')
    const action = mapAction(body.ActionType ?? '')
    const resourceId = body.ResourcePermaKey ?? ''

    const event: WebhookEvent = {
      platform: 'karbon',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    }
    return [event]
  },
}
