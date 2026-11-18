/**
 * QuickBooks Online webhook verification and parsing.
 *
 * Verification: HMAC-SHA256 of raw body using the QBO verifier token.
 * Signature arrives base64-encoded in the `intuit-signature` header.
 *
 * Docs: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { verifyHmacSha256 } from '../../webhook'

// ── QBO payload types ─────────────────────────────────────────────────────────

type QBOEntity = {
  id: string
  name: string               // e.g. "Invoice", "Customer", "Payment"
  type: string               // "CREATE", "UPDATE", "DELETE", "MERGE", "VOID"
  operation: string          // same as type in most contexts
  lastUpdated: string
  deletedId?: string
}

type QBODataChangeEvent = {
  entities: QBOEntity[]
}

type QBOEventNotification = {
  realmId: string
  dataChangeEvent: QBODataChangeEvent
}

type QBOWebhookPayload = {
  eventNotifications: QBOEventNotification[]
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(name: string): WebhookResourceType {
  const map: Record<string, WebhookResourceType> = {
    Invoice: 'invoice',
    Bill: 'bill',
    Customer: 'contact',
    Vendor: 'contact',
    Account: 'account',
    JournalEntry: 'journal',
    Payment: 'payment',
    BillPayment: 'payment',
    Estimate: 'order',
    PurchaseOrder: 'purchaseorder',
    SalesReceipt: 'invoice',
    Deposit: 'transaction',
    Transfer: 'transaction',
    CreditMemo: 'creditmemo',
    Estimate2: 'salesorder',
  }
  return map[name] ?? 'unknown'
}

function mapAction(operation: string): WebhookAction {
  const op = operation.toUpperCase()
  if (op === 'CREATE') return 'created'
  if (op === 'UPDATE' || op === 'MERGE' || op === 'VOID') return 'updated'
  if (op === 'DELETE') return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const quickbooksWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const sig = headers['intuit-signature'] ?? ''
    return verifyHmacSha256(payload, secret, sig, 'base64')
  },

  parseWebhookEvents(payload) {
    const body = payload as QBOWebhookPayload
    if (!Array.isArray(body.eventNotifications)) return []

    const events: WebhookEvent[] = []
    for (const notification of body.eventNotifications) {
      const tenantId = notification.realmId
      for (const entity of notification.dataChangeEvent?.entities ?? []) {
        const resourceType = mapResourceType(entity.name)
        const action = mapAction(entity.operation ?? entity.type)
        events.push({
          platform: 'quickbooks',
          type: `${resourceType}.${action}`,
          resourceType,
          action,
          resourceId: entity.deletedId ?? entity.id,
          tenantId,
          externalAccountId: tenantId,
          payload,
        })
      }
    }
    return events
  },
}
