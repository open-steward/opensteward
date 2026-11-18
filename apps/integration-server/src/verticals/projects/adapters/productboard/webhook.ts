/**
 * Productboard webhook verification + parsing.
 *
 * Productboard signs each delivery with an HMAC-SHA256 digest of the raw
 * request body, keyed by the subscription's shared secret. The signature
 * ships hex-encoded in the `x-productboard-signature` header.
 *
 * The event envelope is `{ data: { eventType, id, links: { target } } }`,
 * where `eventType` is a dotted string such as `feature.created`,
 * `feature.updated`, `feature.deleted`, or `note.created`.
 *
 * Docs: https://developer.productboard.com/reference/createwebhook
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-productboard-signature']

export function verifyProductboardWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const b = Buffer.from(provided.trim(), 'utf8')
      if (a.length !== b.length) continue
      if (timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

function mapResourceType(noun: string | undefined): WebhookResourceType {
  switch (noun) {
    case 'feature':
    case 'subfeature':
      return 'tasks'
    case 'product':
    case 'component':
      return 'projects'
    case 'note':
      return 'comments'
    case 'member':
    case 'user':
      return 'users'
    default:
      return 'unknown'
  }
}

function mapAction(verb: string | undefined): WebhookAction {
  switch (verb) {
    case 'created':
      return 'created'
    case 'updated':
      return 'updated'
    case 'deleted':
    case 'removed':
      return 'deleted'
    default:
      return 'unknown'
  }
}

interface ProductboardEvent {
  eventType?: string
  id?: string
  links?: { target?: string }
}

export function parseProductboardWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const data = payload['data'] as ProductboardEvent | ProductboardEvent[] | undefined
  const events = Array.isArray(data) ? data : data ? [data] : []
  return events.map((evt, i) => {
    const [noun, verb] = (evt.eventType ?? '').split('.')
    return {
      id: `productboard:${evt.eventType ?? 'unknown'}:${evt.id ?? i}`,
      platform: 'productboard',
      type: evt.eventType ?? 'unknown',
      resourceType: mapResourceType(noun),
      action: mapAction(verb),
      resourceId: evt.id ?? '',
      payload: evt as unknown as Record<string, unknown>,
    }
  })
}

export const ProductboardWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyProductboardWebhook,
  parseWebhookEvents: parseProductboardWebhookEvents,
}
