/**
 * Gr4vy webhook signature verification + event parsing.
 *
 * Gr4vy signs each delivery with HMAC-SHA-256 over `{timestamp}.{payload}` —
 * the raw request body prefixed by the `X-Gr4vy-Webhook-Timestamp` header and a
 * literal dot. The hex digest is compared against `X-Gr4vy-Webhook-Signatures`,
 * a comma-separated list (one entry per active secret, to support rotation);
 * the request is authentic if any entry matches.
 *
 * The payload is an event envelope: a `name` like `transaction.captured` plus a
 * `target` object carrying the changed resource's `type` and `id`.
 *
 * Docs: https://docs.gr4vy.com/guides/features/webhooks/signatures
 *       https://docs.gr4vy.com/guides/features/webhooks/payload
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  transaction: 'charges',
  refund: 'refunds',
  buyer: 'customers',
  'payment-method': 'payment_methods',
  payout: 'payouts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  authorized: 'succeeded',
  authenticated: 'updated',
  'authentication-pending': 'updated',
  captured: 'paid',
  'capture-pending': 'updated',
  'capture-failed': 'failed',
  settled: 'paid',
  declined: 'failed',
  failed: 'failed',
  voided: 'cancelled',
  'void-pending': 'updated',
  'void-failed': 'failed',
  'void-declined': 'failed',
  'review-accepted': 'updated',
  succeeded: 'succeeded',
  pending: 'updated',
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  paused: 'updated',
  resumed: 'updated',
}

function classify(eventName: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = eventName.toLowerCase()
  const dot = lowered.indexOf('.')
  if (dot === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, dot)
  const verb = lowered.slice(dot + 1)
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyGr4vyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sigHeader =
      headers['x-gr4vy-webhook-signatures'] ?? headers['X-Gr4vy-Webhook-Signatures']
    const timestamp =
      headers['x-gr4vy-webhook-timestamp'] ?? headers['X-Gr4vy-Webhook-Timestamp']
    if (!sigHeader || !timestamp || !secret) return false
    const signedContent = Buffer.concat([
      Buffer.from(`${timestamp}.`, 'utf8'),
      payload,
    ])
    const expected = createHmac('sha256', secret).update(signedContent).digest('hex')
    const expectedBuf = Buffer.from(expected, 'utf8')
    for (const candidate of sigHeader.split(',')) {
      const trimmed = candidate.trim()
      if (!trimmed) continue
      const candidateBuf = Buffer.from(trimmed, 'utf8')
      if (
        candidateBuf.length === expectedBuf.length &&
        timingSafeEqual(candidateBuf, expectedBuf)
      ) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

export function parseGr4vyWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventName = String(payload['name'] ?? '')
  const target = (payload['target'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(target['id'] ?? payload['id'] ?? '')
  const { resourceType, action } = classify(eventName)
  return [
    {
      id: payload['id'] !== undefined ? String(payload['id']) : undefined,
      platform: 'gr4vy',
      type: eventName,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const Gr4vyWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyGr4vyWebhook,
  parseWebhookEvents: parseGr4vyWebhookEvents,
}
