/**
 * Lago webhook verification + event parsing.
 *
 * Lago supports two signature schemes on the `X-Lago-Signature` header:
 *   1. JWT (RS256) — signed with Lago's private key, verified against a public
 *      key fetched from the org's `/api/v1/webhooks/public_key` endpoint.
 *   2. HMAC (SHA-256) — `base64(HMAC_SHA256(rawBody, orgHmacKey))`.
 *
 * We implement the HMAC scheme: it uses the shared secret the connection
 * already stores, needs no extra key-fetch round-trip, and matches the
 * `secret`-based `verifyWebhook` contract. The digest is base64-encoded and
 * compared in constant time.
 *
 * Event payloads are shaped `{ webhook_type, object_type, <object_type>: {} }`
 * where `webhook_type` is dot-notation like `invoice.created` or
 * `credit_note.created`, and `object_type` names the embedded object key.
 *
 * Docs: https://getlago.com/docs/api-reference/webhooks/format---signature
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  customer: 'customers',
  invoice: 'invoices',
  credit_note: 'refunds',
  subscription: 'subscriptions',
  plan: 'plans',
  fee: 'invoice_line_items',
  payment: 'charges',
  payment_request: 'invoices',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  drafted: 'created',
  finalized: 'finalized',
  voided: 'voided',
  generated: 'created',
  terminated: 'cancelled',
  started: 'created',
  payment_status_updated: 'updated',
  payment_failure: 'failed',
  payment_overdue: 'failed',
  refund_failure: 'failed',
  resolved: 'updated',
}

function classify(webhookType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = webhookType.toLowerCase()
  const dot = lowered.indexOf('.')
  if (dot === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, dot)
  const verb = lowered.slice(dot + 1)
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyLagoWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-lago-signature'] ?? headers['X-Lago-Signature']
    if (!sig || !secret) return false
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseLagoWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const webhookType = String(payload['webhook_type'] ?? '')
  const objectType = String(payload['object_type'] ?? '')
  const object = (payload[objectType] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(
    object['lago_id'] ?? object['external_id'] ?? object['id'] ?? '',
  )
  const { resourceType, action } = classify(webhookType)
  return [
    {
      platform: 'lago',
      type: webhookType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const LagoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyLagoWebhook,
  parseWebhookEvents: parseLagoWebhookEvents,
}
