/**
 * Squarespace webhook verification and event parsing.
 *
 * Squarespace signs webhook payloads using HMAC-SHA256 (hex) with the
 * webhook secret. The signature is in the `x-squarespace-signature` header.
 *
 * Squarespace webhook topics are strings like `order.create`, `extension.uninstall`.
 * The topic is embedded in the payload under the `topic` field.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifySquarespaceWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-squarespace-signature'] ?? headers['X-Squarespace-Signature']
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

// ── Topic → canonical mapping ───────────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'orders',
  product: 'products',
  inventory: 'inventory_levels',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
}

function mapTopic(topic: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('.')
  return {
    resourceType: RESOURCE_MAP[group] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function parseSquarespaceWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  const topic = topicHeader ?? (payload['topic'] as string | undefined) ?? ''
  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id'] ?? (payload['data'] as Record<string, unknown> | undefined)?.['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'squarespace',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const squarespaceWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifySquarespaceWebhook,
  parseWebhookEvents: parseSquarespaceWebhookEvents,
}
