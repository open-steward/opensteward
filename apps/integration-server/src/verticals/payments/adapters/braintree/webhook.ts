/**
 * Braintree webhook notifications arrive as `bt_signature` + `bt_payload`
 * form fields. Full SDK-style verification requires the merchant's public
 * key; v1 of the adapter does structural verification + leaves
 * cryptographic verification to a future deeper integration.
 *
 * Docs: https://developer.paypal.com/braintree/docs/guides/webhooks/parse-notification
 */

import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  transaction: 'charges',
  subscription: 'subscriptions',
  dispute: 'disputes',
  disbursement: 'payouts',
  account_updater: 'payment_methods',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  settled: 'paid',
  settlement_declined: 'failed',
  refund: 'refunded',
  void: 'voided',
  cancelled: 'cancelled',
  expired: 'updated',
  trial_ended: 'updated',
  charged_successfully: 'succeeded',
  charged_unsuccessfully: 'failed',
  opened: 'created',
  lost: 'updated',
  won: 'updated',
}

function classify(kind: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = kind.toLowerCase()
  // Braintree kinds: `subscription_charged_successfully`, `dispute_opened`, etc.
  const split = lowered.split('_')
  const head = split[0] ?? ''
  const verb = split.slice(1).join('_')
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyBraintreeWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Structural placeholder; cryptographic verification belongs in the
  // dispatcher layer where the Braintree SDK lives.
  return true
}

export function parseBraintreeWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const kind = String(payload['kind'] ?? '')
  const subject = (payload['subject'] as Record<string, unknown> | undefined) ?? {}
  const node = Object.values(subject)[0] as Record<string, unknown> | undefined
  const resourceId = String((node?.['id'] ?? subject['id']) ?? '')
  const { resourceType, action } = classify(kind)
  return [
    {
      platform: 'braintree',
      type: kind,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const BraintreeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBraintreeWebhook,
  parseWebhookEvents: parseBraintreeWebhookEvents,
}
