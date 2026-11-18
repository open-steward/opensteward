/**
 * Bolt signs each webhook with an HMAC-SHA256 over the raw request body,
 * keyed by the merchant's Signing Secret. The digest is base64-encoded and
 * delivered in the `X-Bolt-Hmac-Sha256` header.
 *
 *   base64(hmac_sha256(rawBody, signingSecret))   ==   X-Bolt-Hmac-Sha256
 *
 * During key rotation Bolt also sends `X-Bolt-Hmac-Sha256-Pending` signed with
 * the pending key; a match against either header is accepted.
 *
 * Docs: https://help.bolt.com/developers/webhooks/hook-verification/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Bolt hook `type` → canonical resource. Refunds are their own object. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  auth: 'charges',
  authorize: 'charges',
  capture: 'charges',
  payment: 'charges',
  pending: 'charges',
  void: 'charges',
  rejected: 'charges',
  failed_payment: 'charges',
  refund: 'refunds',
  credit: 'refunds',
  chargeback: 'disputes',
}

/** Bolt hook `type` → canonical action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  auth: 'created',
  authorize: 'created',
  pending: 'created',
  capture: 'succeeded',
  payment: 'paid',
  void: 'voided',
  rejected: 'failed',
  failed_payment: 'failed',
  refund: 'refunded',
  credit: 'refunded',
  chargeback: 'disputed',
}

function classify(type: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const key = type.toLowerCase().replace(/[.\s-]+/g, '_')
  return {
    resourceType: RESOURCE_MAP[key] ?? 'unknown',
    action: ACTION_MAP[key] ?? 'unknown',
  }
}

function safeEqualBase64(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'base64')
    const bb = Buffer.from(b, 'base64')
    if (ba.length === 0 || ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

export function verifyBoltWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const active =
      headers['x-bolt-hmac-sha256'] ?? headers['X-Bolt-Hmac-Sha256']
    const pending =
      headers['x-bolt-hmac-sha256-pending'] ?? headers['X-Bolt-Hmac-Sha256-Pending']
    if (!active && !pending) return false
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    if (active && safeEqualBase64(active, expected)) return true
    if (pending && safeEqualBase64(pending, expected)) return true
    return false
  } catch {
    return false
  }
}

export function parseBoltWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const resourceId = String(
    data['transaction_reference'] ??
      data['reference'] ??
      data['id'] ??
      payload['transaction_reference'] ??
      payload['reference'] ??
      payload['id'] ??
      '',
  )
  const { resourceType, action } = classify(type)
  return [
    {
      platform: 'bolt',
      type: type || 'unknown',
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const BoltWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBoltWebhook,
  parseWebhookEvents: parseBoltWebhookEvents,
}
