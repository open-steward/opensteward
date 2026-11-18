/**
 * Volusion webhook verification and event parsing.
 *
 * Volusion uses HMAC-SHA256 signature verification. The signature is sent
 * in the `X-Volusion-Hmac-Sha256` header as a base64-encoded digest.
 *
 * Volusion webhook payloads include `topic` (e.g. `order/created`) and the
 * resource data at the top level.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyVolusionWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-volusion-hmac-sha256'] ?? headers['X-Volusion-Hmac-Sha256']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('base64')
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
  products: 'products',
  category: 'collections',
  categories: 'collections',
  order: 'orders',
  orders: 'orders',
  customer: 'customers',
  customers: 'customers',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  create: 'created',
  created: 'created',
  update: 'updated',
  updated: 'updated',
  delete: 'deleted',
  deleted: 'deleted',
}

function mapTopic(topic: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('/')
  return {
    resourceType: RESOURCE_MAP[group] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function parseVolusionWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  const topic =
    topicHeader ?? (payload['topic'] as string | undefined) ?? ''
  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id'] ?? payload['Id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'volusion',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const volusionWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyVolusionWebhook,
  parseWebhookEvents: parseVolusionWebhookEvents,
}
