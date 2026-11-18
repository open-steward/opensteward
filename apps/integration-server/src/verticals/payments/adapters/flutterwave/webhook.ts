/**
 * Flutterwave delivers webhook notifications signed with a shared "secret
 * hash" value in `verif-hash` (the merchant sets it in the dashboard and
 * the same string is echoed verbatim on every delivery — no per-payload
 * HMAC). We compare timing-safely.
 *
 * Docs: https://developer.flutterwave.com/docs/integration-guides/webhooks/
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  charge: 'charges',
  transfer: 'payouts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  completed: 'paid',
  successful: 'paid',
  failed: 'failed',
  pending: 'created',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Flutterwave event format: `charge.completed`, `transfer.failed`.
  const [head, verb] = eventType.split('.')
  return {
    resourceType: RESOURCE_MAP[head ?? ''] ?? 'unknown',
    action: ACTION_MAP[verb ?? ''] ?? 'unknown',
  }
}

export function verifyFlutterwaveWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const got = headers['verif-hash'] ?? headers['Verif-Hash']
    if (!got) return false
    const a = Buffer.from(got)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseFlutterwaveWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? data['tx_ref'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      platform: 'flutterwave',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const FlutterwaveWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFlutterwaveWebhook,
  parseWebhookEvents: parseFlutterwaveWebhookEvents,
}
