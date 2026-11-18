/**
 * ShipBob webhook verification + parsing.
 *
 * ShipBob follows the Standard Webhooks spec (https://standardwebhooks.com).
 * Confirmed against ShipBob's own documentation (developer.shipbob.com/webhooks,
 * read 2026-09-18) and against the live `POST /2026-01/webhook` contract, whose
 * `secret` field is constrained to `^whsec_[a-zA-Z0-9+/]{32}$`:
 *
 *   headers      webhook-id, webhook-timestamp (unix seconds), webhook-signature
 *   signed bytes `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *   signature    HMAC-SHA256, base64; the header is a space-separated list of
 *                `v1,<base64sig>` entries, one per active secret
 *   key          base64-decode(secret with the `whsec_` prefix removed)
 *
 * Until this rewrite the file was Cin7 Core's verifier with ShipBob's name
 * substituted: a hex HMAC over the body alone, read from `x-shipbob-signature`.
 * Wrong header, wrong signed content, wrong encoding — it rejected every
 * genuine ShipBob callback while looking like a working verifier.
 *
 * ── Topics ────────────────────────────────────────────────────────────────
 *
 * The live topic enum has 29 entries. Exactly six concern this vertical:
 *
 *   wro.created, wro.updated, wro.completed,
 *   wro.box.arrived, wro.box.scanned, wro.box.stowed
 *
 * ShipBob publishes NO product, inventory or stock-level topic. A stock change
 * therefore never arrives by webhook and has to be polled — which is worth
 * knowing, because the previous map implied otherwise by listing
 * `Stock.OnHandChanged`. That is a Cin7 Core event name; ShipBob has never
 * sent it. The remaining topics (order.*, return.*, billing.*) belong to the
 * logistics adapter and are deliberately classified `unknown` here rather than
 * claimed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/** Standard Webhooks' replay window. */
const TOLERANCE_SECONDS = 5 * 60

function secretKeyBytes(secret: string): Buffer {
  const base64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(base64, 'base64')
}

export function verifyShipBobInventoryWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const id = headers['webhook-id'] ?? headers['Webhook-Id']
    const timestamp = headers['webhook-timestamp'] ?? headers['Webhook-Timestamp']
    const sigHeader = headers['webhook-signature'] ?? headers['Webhook-Signature']
    if (!id || !timestamp || !sigHeader) return false

    const ts = parseInt(timestamp, 10)
    if (!Number.isFinite(ts)) return false
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false

    const signed = `${id}.${timestamp}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secretKeyBytes(secret)).update(signed).digest('base64')
    const expectedBuf = Buffer.from(expected, 'base64')

    // One `v1,<base64sig>` entry per active secret, space separated.
    return sigHeader.split(' ').some((entry) => {
      const comma = entry.indexOf(',')
      const sig = comma === -1 ? entry : entry.slice(comma + 1)
      const sigBuf = Buffer.from(sig, 'base64')
      if (sigBuf.length !== expectedBuf.length || sigBuf.length === 0) return false
      return timingSafeEqual(sigBuf, expectedBuf)
    })
  } catch {
    return false
  }
}

/**
 * The six WRO topics, mapped onto canonical resource + action.
 *
 * `wro.box.stowed` is `received` rather than `updated`: stowing is the moment
 * stock becomes part of sellable inventory, which is what a canonical receipt
 * means. `arrived` and `scanned` are handling steps before that.
 */
const TOPIC_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'wro.created': { resourceType: 'purchase-orders', action: 'created' },
  'wro.updated': { resourceType: 'purchase-orders', action: 'updated' },
  'wro.completed': { resourceType: 'purchase-orders', action: 'received' },
  'wro.box.arrived': { resourceType: 'purchase-orders', action: 'updated' },
  'wro.box.scanned': { resourceType: 'purchase-orders', action: 'updated' },
  'wro.box.stowed': { resourceType: 'purchase-orders', action: 'received' },
}

export function parseShipBobInventoryWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const topic = String(payload['topic'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? data['wro_id'] ?? data['receiving_id'] ?? '')
  const mapped = TOPIC_MAP[topic] ?? { resourceType: 'unknown', action: 'unknown' }
  return [
    {
      id: `shipbob-inventory:${topic}:${resourceId}`,
      platform: 'shipbob-inventory',
      type: topic,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const ShipBobInventoryWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyShipBobInventoryWebhook,
  parseWebhookEvents: parseShipBobInventoryWebhookEvents,
}
