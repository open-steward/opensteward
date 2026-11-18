import { describe, it, expect } from 'vitest'
import {
  transformReturnToShipment,
  transformReturnToOrder,
  type LoopReturn,
} from '../../../../../../../src/verticals/logistics/adapters/loop-returns/transform/return'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<LoopReturn> = {}): LoopReturn {
  return {
    id: 555,
    state: 'open',
    outcome: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    order_id: 100,
    order_name: 'ORD-100',
    order_number: '100',
    customer: 'Alice',
    carrier: 'UPS',
    tracking_number: 'TRK-001',
    label_status: 'created',
    label_url: 'https://labels.example.com/lr-555.pdf',
    label_rate: 1200,
    currency: 'USD',
    return_total: 4999,
    line_items: [
      {
        id: 'li-1',
        title: 'Widget',
        sku: 'WDG-01',
        quantity: 2,
        purchase_price: 2000,
        currency: 'USD',
      },
    ],
    ...overrides,
  }
}

// ─── transformReturnToShipment ────────────────────────────────────────────────

describe('loop-returns transformReturnToShipment', () => {
  it('converts numeric id to string', () => {
    expect(transformReturnToShipment(makeRaw({ id: 555 })).id).toBe('555')
  })

  it('maps trackingNumber', () => {
    expect(transformReturnToShipment(makeRaw({ tracking_number: 'TRK-001' })).trackingNumber).toBe(
      'TRK-001',
    )
  })

  it('maps carrierId from carrier', () => {
    expect(transformReturnToShipment(makeRaw({ carrier: 'UPS' })).carrierId).toBe('UPS')
  })

  it('maps labelUrl', () => {
    expect(transformReturnToShipment(makeRaw()).labelUrl).toBe(
      'https://labels.example.com/lr-555.pdf',
    )
  })

  it('maps reference from order_name', () => {
    expect(transformReturnToShipment(makeRaw({ order_name: 'ORD-100' })).reference).toBe('ORD-100')
  })

  it('falls back reference to order_number when order_name is null', () => {
    const result = transformReturnToShipment(makeRaw({ order_name: null, order_number: '100' }))
    expect(result.reference).toBe('100')
  })

  it('maps cost when tracking_number present and state=open → IN_TRANSIT', () => {
    const result = transformReturnToShipment(makeRaw({ state: 'open', tracking_number: 'TRK-001' }))
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps state=closed → DELIVERED when tracking_number is set', () => {
    const result = transformReturnToShipment(makeRaw({ state: 'closed' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps state=cancelled → CANCELLED', () => {
    const result = transformReturnToShipment(makeRaw({ state: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps label_status=pending → PENDING when tracking_number is null', () => {
    const result = transformReturnToShipment(
      makeRaw({ tracking_number: null, label_status: 'pending', state: 'open' }),
    )
    expect(result.status).toBe('PENDING')
  })

  it('maps label_status=created → LABEL_CREATED when no tracking_number', () => {
    const result = transformReturnToShipment(
      makeRaw({ tracking_number: null, label_status: 'created', state: 'open' }),
    )
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps cost.amount from label_rate', () => {
    const result = transformReturnToShipment(makeRaw({ label_rate: 1200, currency: 'USD' }))
    expect(result.cost?.amount).toBe(1200)
    expect(result.cost?.currency).toBe('USD')
  })

  it('cost is undefined when label_rate is null', () => {
    expect(transformReturnToShipment(makeRaw({ label_rate: null })).cost).toBeUndefined()
  })

  it('parses createdAt as Date', () => {
    expect(transformReturnToShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('parses updatedAt as Date', () => {
    expect(transformReturnToShipment(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformReturnToShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformReturnToShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})

// ─── transformReturnToOrder ───────────────────────────────────────────────────

describe('loop-returns transformReturnToOrder', () => {
  it('converts numeric id to string', () => {
    expect(transformReturnToOrder(makeRaw({ id: 555 })).id).toBe('555')
  })

  it('maps orderNumber from order_number', () => {
    expect(transformReturnToOrder(makeRaw({ order_number: '100' })).orderNumber).toBe('100')
  })

  it('falls back orderNumber to order_name when order_number is null', () => {
    const result = transformReturnToOrder(makeRaw({ order_number: null, order_name: 'ORD-100' }))
    expect(result.orderNumber).toBe('ORD-100')
  })

  it('maps status open → RETURNED', () => {
    expect(transformReturnToOrder(makeRaw({ state: 'open' })).status).toBe('RETURNED')
  })

  it('maps status closed → RETURNED', () => {
    expect(transformReturnToOrder(makeRaw({ state: 'closed' })).status).toBe('RETURNED')
  })

  it('maps status cancelled → CANCELLED', () => {
    expect(transformReturnToOrder(makeRaw({ state: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status expired → CANCELLED', () => {
    expect(transformReturnToOrder(makeRaw({ state: 'expired' })).status).toBe('CANCELLED')
  })

  it('maps status review → ON_HOLD', () => {
    expect(transformReturnToOrder(makeRaw({ state: 'review' })).status).toBe('ON_HOLD')
  })

  // Note: unknown state maps to 'unknown' (lowercase) — this is the withUnknown sentinel
  it('maps unknown state → unknown (lowercase sentinel)', () => {
    expect(transformReturnToOrder(makeRaw({ state: 'mystery' })).status).toBe('unknown')
  })

  it('maps currency', () => {
    expect(transformReturnToOrder(makeRaw({ currency: 'USD' })).currency).toBe('USD')
  })

  it('maps totalAmount from return_total', () => {
    expect(transformReturnToOrder(makeRaw({ return_total: 4999 })).totalAmount).toBe(4999)
  })

  it('falls back totalAmount to total when return_total is null', () => {
    const result = transformReturnToOrder(makeRaw({ return_total: null, total: 3000 }))
    expect(result.totalAmount).toBe(3000)
  })

  it('maps lineItems array with correct fields', () => {
    const result = transformReturnToOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].name).toBe('Widget')
    expect(result.lineItems![0].sku).toBe('WDG-01')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(2000)
    expect(result.lineItems![0].totalAmount).toBe(4000) // 2000 * 2
  })

  it('lineItems is undefined when line_items is empty', () => {
    expect(transformReturnToOrder(makeRaw({ line_items: [] })).lineItems).toBeUndefined()
  })

  it('parses createdAt as Date', () => {
    expect(transformReturnToOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformReturnToOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    const result = transformReturnToOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
