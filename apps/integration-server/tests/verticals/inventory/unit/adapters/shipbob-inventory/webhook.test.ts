import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHmac, randomBytes } from 'node:crypto'
import {
  verifyShipBobInventoryWebhook,
  parseShipBobInventoryWebhookEvents,
} from '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/webhook'
import { WebhookEventSchema } from '../../../../../../src/verticals/inventory/schema/webhook'

/**
 * ShipBob follows the Standard Webhooks spec. Confirmed against ShipBob's own
 * documentation (developer.shipbob.com/webhooks, read 2026-09-18) and against
 * the live `POST /2026-01/webhook` contract, whose `secret` field is
 * constrained to `^whsec_[a-zA-Z0-9+/]{32}$`:
 *
 *   headers      webhook-id, webhook-timestamp, webhook-signature
 *   signed bytes `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *   signature    HMAC-SHA256, base64, header carries `v1,<sig>` entries
 *   key          base64-decode(secret without the `whsec_` prefix)
 *
 * Before this rewrite the verifier was Cin7 Core's: hex HMAC over the body
 * alone, read from `x-shipbob-signature`. Wrong header, wrong signed content
 * and wrong encoding — it rejected every genuine ShipBob callback.
 */
const KEY = randomBytes(24)
const SECRET = `whsec_${KEY.toString('base64')}`

function sign(body: string, id: string, ts: string, key: Buffer = KEY): string {
  return createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000))
}

function headersFor(body: string, over: Record<string, string> = {}) {
  const id = 'msg_2f6b1c'
  const ts = nowSeconds()
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${sign(body, id, ts)}`,
    ...over,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('shipbob-inventory webhook verification', () => {
  it('accepts a correctly signed Standard Webhooks callback', () => {
    const body = JSON.stringify({ topic: 'wro.completed', data: { id: 662894 } })
    expect(
      verifyShipBobInventoryWebhook(Buffer.from(body), headersFor(body), SECRET),
    ).toBe(true)
  })

  it('signs the id and timestamp with the body, not the body alone', () => {
    // The old verifier HMAC'd the raw body only. A signature computed that way
    // must not be accepted, or the fix is cosmetic.
    const body = JSON.stringify({ topic: 'wro.created' })
    const bodyOnly = createHmac('sha256', KEY).update(body).digest('base64')
    const headers = { ...headersFor(body), 'webhook-signature': `v1,${bodyOnly}` }
    expect(verifyShipBobInventoryWebhook(Buffer.from(body), headers, SECRET)).toBe(false)
  })

  it('reads the key as base64 bytes, not as the literal secret string', () => {
    const body = JSON.stringify({ topic: 'wro.updated' })
    const id = 'msg_1'
    const ts = nowSeconds()
    // Signed with the secret used verbatim as an ASCII key — the naive reading.
    const wrongKey = createHmac('sha256', SECRET).update(`${id}.${ts}.${body}`).digest('base64')
    const headers = {
      'webhook-id': id,
      'webhook-timestamp': ts,
      'webhook-signature': `v1,${wrongKey}`,
    }
    expect(verifyShipBobInventoryWebhook(Buffer.from(body), headers, SECRET)).toBe(false)
  })

  it('accepts any entry in a multi-secret signature header', () => {
    // During a secret rotation ShipBob sends one `v1,<sig>` per active secret.
    const body = JSON.stringify({ topic: 'wro.box.stowed' })
    const base = headersFor(body)
    const other = createHmac('sha256', randomBytes(24)).update('nonsense').digest('base64')
    const headers = {
      ...base,
      'webhook-signature': `v1,${other} ${base['webhook-signature']}`,
    }
    expect(verifyShipBobInventoryWebhook(Buffer.from(body), headers, SECRET)).toBe(true)
  })

  it('rejects a payload signed with a different secret', () => {
    const body = JSON.stringify({ topic: 'wro.created' })
    const id = 'msg_1'
    const ts = nowSeconds()
    const headers = {
      'webhook-id': id,
      'webhook-timestamp': ts,
      'webhook-signature': `v1,${sign(body, id, ts, randomBytes(24))}`,
    }
    expect(verifyShipBobInventoryWebhook(Buffer.from(body), headers, SECRET)).toBe(false)
  })

  it('rejects a body altered after signing', () => {
    const body = JSON.stringify({ topic: 'wro.completed', data: { id: 662894 } })
    const headers = headersFor(body)
    const tampered = JSON.stringify({ topic: 'wro.completed', data: { id: 999999 } })
    expect(verifyShipBobInventoryWebhook(Buffer.from(tampered), headers, SECRET)).toBe(false)
  })

  it('rejects a replayed callback outside the timestamp tolerance', () => {
    const body = JSON.stringify({ topic: 'wro.created' })
    const headers = headersFor(body)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + 10 * 60 * 1000))
    expect(verifyShipBobInventoryWebhook(Buffer.from(body), headers, SECRET)).toBe(false)
  })

  it('fails closed when a required header is missing', () => {
    const body = JSON.stringify({ topic: 'wro.created' })
    const full = headersFor(body)
    for (const drop of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const headers = { ...full }
      delete (headers as Record<string, string>)[drop]
      expect(verifyShipBobInventoryWebhook(Buffer.from(body), headers, SECRET)).toBe(false)
    }
    expect(verifyShipBobInventoryWebhook(Buffer.from(body), {}, SECRET)).toBe(false)
  })

  it('does not accept the retired Cin7 header', () => {
    const body = JSON.stringify({ topic: 'wro.created' })
    const hex = createHmac('sha256', SECRET).update(body).digest('hex')
    expect(
      verifyShipBobInventoryWebhook(Buffer.from(body), { 'x-shipbob-signature': hex }, SECRET),
    ).toBe(false)
  })
})

describe('shipbob-inventory webhook parsing', () => {
  /**
   * The topic list is the live enum from `POST /2026-01/webhook` (2026-09-18).
   * Only the six `wro.*` topics concern the inventory vertical: ShipBob
   * publishes NO product, stock or inventory-level topic at all, so a stock
   * change never arrives by webhook and must be polled.
   *
   * The previous map listed Cin7 Core's event names — Stock.OnHandChanged,
   * Product.Modified, PurchaseOrder.Created, StockAdjustment.Posted — none of
   * which ShipBob has ever sent. Every real callback classified as unknown.
   */
  it.each([
    ['wro.created', 'created'],
    ['wro.updated', 'updated'],
    ['wro.completed', 'received'],
    ['wro.box.arrived', 'updated'],
    ['wro.box.scanned', 'updated'],
    ['wro.box.stowed', 'received'],
  ] as const)('maps %s to a purchase-order %s event', (topic, action) => {
    const [event] = parseShipBobInventoryWebhookEvents({ topic, data: { id: 662894 } })
    expect(event!.resourceType).toBe('purchase-orders')
    expect(event!.action).toBe(action)
    expect(event!.resourceId).toBe('662894')
    expect(event!.platform).toBe('shipbob-inventory')
  })

  it('produces events that satisfy the canonical schema', () => {
    for (const e of parseShipBobInventoryWebhookEvents({ topic: 'wro.completed', data: { id: 1 } })) {
      expect(() => WebhookEventSchema.parse(e)).not.toThrow()
    }
  })

  it('classifies a topic from another vertical as unknown rather than guessing', () => {
    // order.* and return.* are real ShipBob topics, but they belong to the
    // logistics adapter. Claiming them here would invent inventory events.
    const [event] = parseShipBobInventoryWebhookEvents({ topic: 'order.shipped', data: { id: 5 } })
    expect(event!.resourceType).toBe('unknown')
    expect(event!.action).toBe('unknown')
  })

  it('does not resurrect the Cin7 event names', () => {
    const [event] = parseShipBobInventoryWebhookEvents({
      Type: 'Stock.OnHandChanged',
      Data: { ID: 'p1' },
    })
    expect(event!.resourceType).toBe('unknown')
  })

  it('never labels an event with the cin7-core platform', () => {
    // The old parser built ids as `cin7-core:${type}:${id}`.
    const [event] = parseShipBobInventoryWebhookEvents({ topic: 'wro.created', data: { id: 7 } })
    expect(JSON.stringify(event)).not.toContain('cin7')
  })
})
