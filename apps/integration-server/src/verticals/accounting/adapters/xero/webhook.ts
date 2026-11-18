/**
 * Xero webhook verification and parsing.
 *
 * Verification: HMAC-SHA256 of raw body using the Xero webhook signing key.
 * Signature arrives base64-encoded in the `x-xero-signature` header.
 *
 * Docs: https://developer.xero.com/documentation/guides/webhooks/overview/
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { verifyHmacSha256 } from '../../webhook'

// ── Xero payload types ────────────────────────────────────────────────────────

type XeroEvent = {
  resourceId: string
  resourceUrl: string
  eventType: string       // e.g. "CREATE", "UPDATE", "DELETE"
  eventCategory: string   // e.g. "INVOICE", "CONTACT", "PAYMENT"
  eventDateUtc: string
  tenantId: string
  tenantType: string
}

type XeroWebhookPayload = {
  events: XeroEvent[]
  firstEventSequence: number
  lastEventSequence: number
  entropy: string
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(category: string): WebhookResourceType {
  const map: Record<string, WebhookResourceType> = {
    INVOICE: 'invoice',
    CONTACT: 'contact',
    PAYMENT: 'payment',
    CREDITNOTE: 'creditmemo',
    ACCOUNT: 'account',
    PURCHASEORDER: 'purchaseorder',
    BANKTRANSACTION: 'transaction',
    TRACKING: 'unknown',
  }
  return map[category.toUpperCase()] ?? 'unknown'
}

function mapAction(eventType: string): WebhookAction {
  const map: Record<string, WebhookAction> = {
    CREATE: 'created',
    UPDATE: 'updated',
    DELETE: 'deleted',
  }
  return map[eventType.toUpperCase()] ?? 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const xeroWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const sig = headers['x-xero-signature'] ?? ''
    return verifyHmacSha256(payload, secret, sig, 'base64')
  },

  parseWebhookEvents(payload) {
    const body = payload as XeroWebhookPayload
    if (!Array.isArray(body.events)) return []

    return body.events.map((ev): WebhookEvent => {
      const resourceType = mapResourceType(ev.eventCategory)
      const action = mapAction(ev.eventType)
      return {
        platform: 'xero',
        type: `${resourceType}.${action}`,
        resourceType,
        action,
        resourceId: ev.resourceId,
        tenantId: ev.tenantId,
        externalAccountId: ev.tenantId,
        payload: payload,
      }
    })
  },
}
