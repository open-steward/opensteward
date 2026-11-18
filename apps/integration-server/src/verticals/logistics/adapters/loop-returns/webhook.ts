import { createHmac, timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'
import { LOOP_RETURNS_SIGNATURE_HEADER } from './constants'

/**
 * Loop Returns webhook signature verification.
 *
 * Loop Returns signs each webhook notification using HMAC-SHA256 over the raw
 * JSON body keyed with the webhook secret. The base64 digest is transmitted in
 * the `X-Loop-Signature` request header. Before hashing, slashes in the JSON
 * body must be escaped and newlines removed.
 *
 * Reference: https://docs.loopreturns.com/webhook-reference/topics
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature =
    headers[LOOP_RETURNS_SIGNATURE_HEADER] ??
    headers['X-Loop-Signature'] ??
    headers['x-loop-signature'] ??
    ''
  if (!signature || !secret) return false

  // Loop requires slashes escaped and newlines stripped from the JSON body
  // before computing the HMAC.
  const normalised = payload
    .toString('utf8')
    .replace(/\//g, '\\/')
    .replace(/\n/g, '')

  const expected = createHmac('sha256', secret)
    .update(Buffer.from(normalised, 'utf8'))
    .digest('base64')

  try {
    const a = Buffer.from(signature, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Parse a Loop Returns webhook payload into canonical WebhookEvents.
 *
 * Loop Returns webhook payloads include a `trigger` property identifying the
 * event type (e.g. `return_created`, `label_created`, `shipment_processed`).
 * The entire payload is forwarded as the event payload.
 *
 * Known trigger values:
 *   return_created, return_updated, return_closed,
 *   label_created, label_updated,
 *   restock_requested, gift_card_requested,
 *   shipment_processed
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const trigger = String(payload['trigger'] ?? '')

  type CanonicalAction = WebhookEvent['action']
  type CanonicalResourceType = WebhookEvent['resourceType']

  let resourceType: CanonicalResourceType = 'shipment'
  let action: CanonicalAction = 'updated'

  if (trigger.startsWith('return_')) {
    resourceType = 'shipment'
    if (trigger === 'return_created') action = 'created'
    else if (trigger === 'return_closed') action = 'updated'
    else if (trigger === 'return_updated') action = 'updated'
  } else if (trigger.startsWith('label_')) {
    resourceType = 'label'
    if (trigger === 'label_created') action = 'created'
    else action = 'updated'
  } else if (trigger === 'shipment_processed') {
    resourceType = 'shipment'
    action = 'updated'
  } else if (trigger === 'restock_requested') {
    resourceType = 'shipment'
    action = 'updated'
  }

  // Extract resource id from common payload shapes
  const data = (payload['data'] ?? payload) as Record<string, unknown>
  const resourceId =
    data['id'] != null ? String(data['id'])
    : data['return_id'] != null ? String(data['return_id'])
    : undefined

  return [
    {
      platform: 'loop-returns',
      type: trigger,
      resourceType,
      action,
      resourceId,
      payload: data,
    },
  ]
}

export const loopReturnsWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
