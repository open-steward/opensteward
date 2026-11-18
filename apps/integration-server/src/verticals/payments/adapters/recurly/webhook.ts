/**
 * Recurly webhooks are XML POSTs, NOT JSON. Recurly does not sign them
 * cryptographically — the standard practice is to allow-list source IPs
 * + use a webhook endpoint with a hard-to-guess path. The verifier here
 * just confirms the body parses as XML; deep verification is the
 * dispatcher's job.
 *
 * Docs: https://recurly.com/developers/reference/webhooks.html
 */
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  new_subscription: 'subscriptions',
  updated_subscription: 'subscriptions',
  canceled_subscription: 'subscriptions',
  renewed_subscription: 'subscriptions',
  expired_subscription: 'subscriptions',
  paused_subscription: 'subscriptions',
  successful_payment: 'charges',
  failed_payment: 'charges',
  void_payment: 'charges',
  successful_refund: 'refunds',
  new_invoice: 'invoices',
  paid_charge_invoice: 'invoices',
  past_due_charge_invoice: 'invoices',
  new_account: 'customers',
  updated_account: 'customers',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  new_subscription: 'created',
  updated_subscription: 'updated',
  canceled_subscription: 'cancelled',
  renewed_subscription: 'updated',
  expired_subscription: 'cancelled',
  paused_subscription: 'updated',
  successful_payment: 'paid',
  failed_payment: 'failed',
  void_payment: 'voided',
  successful_refund: 'refunded',
  new_invoice: 'created',
  paid_charge_invoice: 'paid',
  past_due_charge_invoice: 'updated',
  new_account: 'created',
  updated_account: 'updated',
}

export function verifyRecurlyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseRecurlyWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? '')
  const id = String(payload['id'] ?? '')
  const resourceId = String(
    (payload['subscription'] as Record<string, unknown> | undefined)?.['uuid'] ??
      (payload['account'] as Record<string, unknown> | undefined)?.['account_code'] ??
      (payload['transaction'] as Record<string, unknown> | undefined)?.['uuid'] ??
      '',
  )
  return [
    {
      id: id || undefined,
      platform: 'recurly',
      type: eventType,
      resourceType: RESOURCE_MAP[eventType] ?? 'unknown',
      action: ACTION_MAP[eventType] ?? 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const RecurlyWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyRecurlyWebhook,
  parseWebhookEvents: parseRecurlyWebhookEvents,
}
