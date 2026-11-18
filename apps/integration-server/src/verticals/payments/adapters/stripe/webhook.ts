/**
 * Stripe webhook verification + event parsing.
 *
 * Stripe signs deliveries with a HMAC-SHA256 of `${timestamp}.${rawBody}` using
 * the webhook signing secret. The signature ships in `Stripe-Signature` as
 * `t=…,v1=…[,v0=…]`. Compare with `timingSafeEqual`.
 *
 * Event types like `charge.succeeded` map to `{resourceType, action}` here.
 *
 * Docs: https://docs.stripe.com/webhooks/signatures
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const TOLERANCE_SECONDS = 5 * 60

function parseSignatureHeader(header: string): { t: number; v1: string[] } | null {
  let t = 0
  const v1: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.split('=')
    if (!k || !v) continue
    if (k.trim() === 't') t = parseInt(v.trim(), 10)
    else if (k.trim() === 'v1') v1.push(v.trim())
  }
  return t && v1.length > 0 ? { t, v1 } : null
}

export function verifyStripeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const header = headers['stripe-signature'] ?? headers['Stripe-Signature']
    if (!header) return false
    const parsed = parseSignatureHeader(header)
    if (!parsed) return false

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parsed.t) > TOLERANCE_SECONDS) return false

    const signed = `${parsed.t}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secret).update(signed).digest('hex')
    return parsed.v1.some((sig) => {
      const a = Buffer.from(sig, 'hex')
      const b = Buffer.from(expected, 'hex')
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    })
  } catch {
    return false
  }
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  charge: 'charges',
  payment_intent: 'charges',
  refund: 'refunds',
  customer: 'customers',
  payment_method: 'payment_methods',
  subscription: 'subscriptions',
  invoice: 'invoices',
  invoiceitem: 'invoice_line_items',
  payout: 'payouts',
  charge_dispute: 'disputes',
  dispute: 'disputes',
  plan: 'plans',
  price: 'prices',
  product: 'products',
  balance_transaction: 'balance_transactions',
  mandate: 'mandates',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  succeeded: 'succeeded',
  failed: 'failed',
  refunded: 'refunded',
  paid: 'paid',
  finalized: 'finalized',
  voided: 'voided',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  closed: 'updated',
  payment_succeeded: 'paid',
}

function classifyEvent(type: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Stripe event format: `<resource>.<action>` or `<resource>.dispute.<action>` etc.
  const lowered = type.toLowerCase()
  const verbStart = lowered.indexOf('.')
  if (verbStart === -1) return { resourceType: 'unknown', action: 'unknown' }
  const resource = lowered.slice(0, verbStart)
  const verbTail = lowered.slice(verbStart + 1)
  const verb = verbTail.split('.').pop() ?? verbTail
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function parseStripeWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const id = String((payload['id'] as string) ?? '')
  const dataObject = ((payload['data'] as Record<string, unknown>)?.['object'] ?? {}) as Record<
    string,
    unknown
  >
  const resourceId = String(dataObject['id'] ?? '')
  const { resourceType, action } = classifyEvent(type)
  // Connect events carry the connected account id (`acct_…`) at the top level.
  // Direct (non-Connect) integrations omit it → undefined → single-connection
  // fallback in the router.
  const externalAccountId = String(payload['account'] ?? '') || undefined
  return [
    {
      id: id || undefined,
      platform: 'stripe',
      type,
      resourceType,
      action,
      resourceId,
      externalAccountId,
      payload,
    },
  ]
}

export const StripeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyStripeWebhook,
  parseWebhookEvents: parseStripeWebhookEvents,
}
