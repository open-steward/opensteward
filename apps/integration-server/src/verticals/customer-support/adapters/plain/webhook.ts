/**
 * Plain webhook verification + parsing.
 *
 * Plain signs requests using HMAC-SHA256 over the raw request body.
 * The signature (hex-encoded) is delivered in the `Plain-Request-Signature` header.
 * The signing secret is configured in Settings → Request signing.
 *
 * Docs: https://www.plain.com/docs/request-signing
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'plain-request-signature'

export function verifyPlainWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Headers may be cased differently; normalise to lowercase lookup
    const normalised: Record<string, string> = {}
    for (const [k, v] of Object.entries(headers)) {
      normalised[k.toLowerCase()] = v
    }
    const provided = normalised[SIG_HEADER]
    if (!provided) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Plain webhook event type strings.
 * Docs: https://www.plain.com/docs/webhooks
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'thread.thread_created': { resourceType: 'tickets', action: 'created' },
  'thread.thread_status_transitioned': { resourceType: 'tickets', action: 'updated' },
  'thread.thread_assignment_transitioned': { resourceType: 'tickets', action: 'assigned' },
  'customer.customer_created': { resourceType: 'contacts', action: 'created' },
  'customer.customer_updated': { resourceType: 'contacts', action: 'updated' },
  'customer.customer_deleted': { resourceType: 'contacts', action: 'deleted' },
}

export function parsePlainWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? payload['eventType'] ?? '')
  const threadPayload = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const thread = (threadPayload['thread'] as Record<string, unknown> | undefined) ?? {}
  const customer = (threadPayload['customer'] as Record<string, unknown> | undefined) ?? {}

  const mapped = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  const resourceId =
    pickResourceId(mapped.resourceType, thread, customer) ?? String(payload['id'] ?? '')

  return [
    {
      id: String(payload['id'] ?? `plain:${type}:${resourceId}`),
      platform: 'plain',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? resourceId : undefined,
      payload,
    },
  ]
}

function pickResourceId(
  resourceType: WebhookResourceType,
  thread: Record<string, unknown>,
  customer: Record<string, unknown>,
): string | undefined {
  if (resourceType === 'tickets') return String(thread['id'] ?? '') || undefined
  if (resourceType === 'contacts') return String(customer['id'] ?? '') || undefined
  return undefined
}

export const PlainWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPlainWebhook,
  parseWebhookEvents: parsePlainWebhookEvents,
}
