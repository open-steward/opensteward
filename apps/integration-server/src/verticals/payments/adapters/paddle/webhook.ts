/**
 * Paddle webhooks include a `Paddle-Signature` header — comma-separated
 * `ts=…,h1=…` where `h1` is the HMAC-SHA-256 hex of `${ts}:${rawBody}`
 * using the webhook secret.
 *
 * Docs: https://developer.paddle.com/webhooks/signature-verification
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

function parseHeader(header: string): { ts?: string; h1?: string } {
  const out: { ts?: string; h1?: string } = {}
  for (const part of header.split(',')) {
    const [k, v] = part.split('=')
    if (!k || !v) continue
    if (k.trim() === 'ts') out.ts = v.trim()
    else if (k.trim() === 'h1') out.h1 = v.trim()
  }
  return out
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  transaction: 'charges',
  subscription: 'subscriptions',
  customer: 'customers',
  invoice: 'invoices',
  adjustment: 'refunds',
  payout: 'payouts',
  product: 'products',
  price: 'prices',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  paid: 'paid',
  completed: 'paid',
  past_due: 'updated',
  payment_failed: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  resumed: 'updated',
  paused: 'updated',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Paddle event format: `<resource>.<action>` e.g. subscription.cancelled
  const [head, verb] = eventType.split('.')
  return {
    resourceType: RESOURCE_MAP[head ?? ''] ?? 'unknown',
    action: ACTION_MAP[verb ?? ''] ?? 'unknown',
  }
}

export function verifyPaddleWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const header = headers['paddle-signature'] ?? headers['Paddle-Signature']
    if (!header) return false
    const parsed = parseHeader(header)
    if (!parsed.ts || !parsed.h1) return false
    const signedString = `${parsed.ts}:${payload.toString('utf8')}`
    const expected = createHmac('sha256', secret).update(signedString).digest('hex')
    const a = Buffer.from(parsed.h1, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parsePaddleWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? '')
  const id = String(payload['event_id'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: id || undefined,
      platform: 'paddle',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PaddleWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPaddleWebhook,
  parseWebhookEvents: parsePaddleWebhookEvents,
}
