/**
 * Marketplacer webhook verification and event parsing.
 *
 * Verification: Marketplacer's HMAC signing ("Marketplacer-HMAC-256") is
 * documented as "only available for Operator-based webhooks" — a Seller
 * connection cannot use it. The only signing option Marketplacer documents
 * as available to Sellers is "Option 1: Add a Key or Token Directly to the
 * Header" ("Note: This method is available for both Operators & Sellers"):
 * configure an arbitrary header name + value in the Marketplacer Webhooks
 * Admin page, and compare it on receipt. This adapter standardises on the
 * header name in `WEBHOOK_TOKEN_HEADER` (Marketplacer lets the seller name
 * it anything; that name is OUR convention, documented in the Connect Link
 * webhook-setup instructions, not a Marketplacer-fixed one) and compares its
 * value to the per-connection webhook secret with a timing-safe, fail-closed
 * check.
 *
 * Event parsing: Sellers can only receive webhooks for a subset of entity
 * types — "Invoice, InvoiceAnnotation, RefundRequest,
 * RefundRequestLineItem, ReturnShipment, Variant" (Sellers cannot receive
 * Advert/Shipment webhooks; those are Operator-only). The exact wire shape
 * (which field/header carries the entity type and the create/update/delete
 * verb) is not shown in a worked example in the public docs, so this parser
 * reads the most likely places in order — `__typename` (Marketplacer's
 * GraphQL objects commonly embed it) plus an `eventType`/`event`/`topic`
 * field or an `X-Marketplacer-Topic`/`X-Marketplacer-Event` header. Neither
 * the resource type nor the action is ever guessed: whichever one cannot be
 * determined from the payload/headers is reported as the canonical
 * `'unknown'` value rather than assumed. Treat this half as best-effort
 * pending a live payload capture.
 *
 * Docs: https://api.marketplacer.com/docs/webhooks/securingwebhooks/
 *       https://api.marketplacer.com/docs/webhooks/webhooksgettingstarted/
 */

import { timingSafeEqual } from 'node:crypto'
import { WEBHOOK_TOKEN_HEADER } from './constants'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

export function verifyMarketplacerWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const provided = headers[WEBHOOK_TOKEN_HEADER]
    if (!provided) return false
    const a = Buffer.from(provided)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  invoice: 'orders',
  invoiceannotation: 'orders',
  refundrequest: 'refunds',
  refundrequestlineitem: 'refunds',
  returnshipment: 'fulfillments',
  variant: 'inventory_levels',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  create: 'created',
  created: 'created',
  update: 'updated',
  updated: 'updated',
  delete: 'deleted',
  deleted: 'deleted',
}

function resolveType(payload: Record<string, unknown>, topicHeader?: string): string | undefined {
  if (topicHeader) return topicHeader.split(/[.:/]/)[0]
  const typename = payload['__typename']
  if (typeof typename === 'string') return typename
  return undefined
}

function resolveAction(payload: Record<string, unknown>, topicHeader?: string): string | undefined {
  if (topicHeader) {
    const parts = topicHeader.split(/[.:/]/)
    return parts[1]
  }
  const candidate = payload['eventType'] ?? payload['event'] ?? payload['action']
  return typeof candidate === 'string' ? candidate : undefined
}

export function parseMarketplacerWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  const typeRaw = resolveType(payload, topicHeader)
  const actionRaw = resolveAction(payload, topicHeader)
  const resourceType = typeRaw ? (RESOURCE_MAP[typeRaw.toLowerCase()] ?? 'unknown') : 'unknown'
  // No verb defaulting: an unrecognised/undetermined action is reported as
  // 'unknown' — never silently guessed as 'updated' — per the canonical
  // WebhookAction contract every other adapter's parser follows.
  const action = actionRaw ? (ACTION_MAP[actionRaw.toLowerCase()] ?? 'unknown') : 'unknown'

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'marketplacer',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const marketplacerWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyMarketplacerWebhook,
  parseWebhookEvents: parseMarketplacerWebhookEvents,
}
