/**
 * Conekta signs webhooks with an **asymmetric** RSA-SHA256 signature, not a
 * shared-secret HMAC. Conekta keeps the private key and signs the raw,
 * UTF-8-encoded request body; the merchant verifies with the matching RSA
 * **public key** (obtained from the Conekta panel / webhook-keys endpoint).
 * The base64-encoded signature ships in the `digest` header.
 *
 * To fit the `verifyWebhook(payload, headers, secret)` seam, `secret` is the
 * PEM-encoded RSA public key (a `-----BEGIN PUBLIC KEY-----` block). This is
 * the only place the "secret" is a public key rather than a shared secret —
 * which is fine: the signing key never leaves Conekta.
 *
 * Docs: https://developers.conekta.com/docs/autenticaci%C3%B3n-webhooks
 */
import { createVerify } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'charges',
  charge: 'charges',
  customer: 'customers',
  payment_source: 'payment_methods',
  paymentsource: 'payment_methods',
  subscription: 'subscriptions',
  plan: 'plans',
  payout: 'payouts',
  payout_order: 'payouts',
  chargeback: 'disputes',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  paid: 'paid',
  updated: 'updated',
  update: 'updated',
  deleted: 'deleted',
  refunded: 'refunded',
  partially_refunded: 'refunded',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  voided: 'voided',
  declined: 'failed',
  expired: 'failed',
  chargeback_created: 'disputed',
  pre_authorized: 'created',
}

/**
 * Conekta event names are dot-delimited: `order.paid`, `charge.refunded`,
 * `subscription.canceled`, `plan.created`, `charge.chargeback.created`. We
 * take the head segment as the resource and the remaining segments (joined
 * with `_`) as the verb.
 */
function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = eventType.toLowerCase()
  const dot = lowered.indexOf('.')
  if (dot === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, dot)
  const verb = lowered.slice(dot + 1).replace(/\./g, '_')
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyConektaWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['digest'] ?? headers['Digest'] ?? headers['DIGEST']
    if (!sig || !secret) return false
    const verifier = createVerify('RSA-SHA256')
    verifier.update(payload)
    verifier.end()
    return verifier.verify(secret, sig, 'base64')
  } catch {
    return false
  }
}

export function parseConektaWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const object = (data['object'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(object['id'] ?? data['id'] ?? payload['id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: payload['id'] != null ? String(payload['id']) : undefined,
      platform: 'conekta',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const ConektaWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyConektaWebhook,
  parseWebhookEvents: parseConektaWebhookEvents,
}
