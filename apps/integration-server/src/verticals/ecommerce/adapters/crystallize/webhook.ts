/**
 * Crystallize webhook verification and event parsing.
 *
 * Verification: Crystallize signs the raw request body with HMAC-SHA256
 * and sends the hex signature in the `x-crystallize-signature` header.
 *
 * Event parsing: Crystallize sends the event topic in the payload as
 * `topic` (e.g. `product.created`, `order.updated`).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { WEBHOOK_SIGNATURE_HEADER } from './constants'

export function verifyCrystallizeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers[WEBHOOK_SIGNATURE_HEADER] ?? headers['X-Crystallize-Signature']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Topic -> canonical mapping ──────────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  item: 'products',
  topic: 'collections',
  order: 'orders',
  customer: 'customers',
  stock: 'inventory_levels',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  published: 'updated',
  unpublished: 'updated',
}

function mapTopic(topic: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Crystallize topic format: "product.created", "order.updated", etc.
  const lower = topic.toLowerCase()
  const dotIndex = lower.indexOf('.')
  if (dotIndex === -1) {
    return { resourceType: 'unknown', action: 'unknown' }
  }
  const resource = lower.slice(0, dotIndex)
  const verb = lower.slice(dotIndex + 1)
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Crystallize webhook delivery into canonical events.
 * Crystallize delivers one event per HTTP request.
 */
export function parseCrystallizeWebhookEvents(
  payload: Record<string, unknown>,
  topicOverride?: string,
): WebhookEvent[] {
  const topic = topicOverride ?? (payload['topic'] as string | undefined) ?? ''
  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id'] ?? payload['itemId']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'crystallize',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const crystallizeWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyCrystallizeWebhook,
  parseWebhookEvents: parseCrystallizeWebhookEvents,
}
