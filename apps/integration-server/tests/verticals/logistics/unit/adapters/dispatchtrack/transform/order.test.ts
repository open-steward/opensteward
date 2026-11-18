import { describe, it, expect } from 'vitest'
import { transformOrderFromServiceOrder } from '../../../../../../../src/verticals/logistics/adapters/dispatchtrack/transform/order'
import type { DispatchTrackServiceOrder } from '../../../../../../../src/verticals/logistics/adapters/dispatchtrack/transform/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(o: Partial<DispatchTrackServiceOrder> = {}): DispatchTrackServiceOrder {
  return {
    id: 'dt-200',
    number: 'DT-ORD-200',
    status: 'delivered',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    contact_name: 'Alice Smith',
    contact_address: '789 Elm St',
    store_code: 'WH-EAST',
    notes: 'Fragile',
    items: [{ id: 'item-1', code: 'SKU-ABC', description: 'Widget', quantity: 3 }],
    ...o,
  }
}

describe('dispatchtrack transformOrderFromServiceOrder', () => {
  it('maps id to string', () => {
    expect(transformOrderFromServiceOrder(makeRaw()).id).toBe('dt-200')
  })

  it('maps number to orderNumber', () => {
    expect(transformOrderFromServiceOrder(makeRaw()).orderNumber).toBe('DT-ORD-200')
  })

  it('delivered → DELIVERED', () => {
    expect(transformOrderFromServiceOrder(makeRaw({ status: 'delivered' })).status).toBe(
      'DELIVERED',
    )
  })

  it('new → PENDING', () => {
    expect(transformOrderFromServiceOrder(makeRaw({ status: 'new' })).status).toBe('PENDING')
  })

  it('scheduled → PROCESSING', () => {
    expect(transformOrderFromServiceOrder(makeRaw({ status: 'scheduled' })).status).toBe(
      'PROCESSING',
    )
  })

  it('started → SHIPPED', () => {
    expect(transformOrderFromServiceOrder(makeRaw({ status: 'started' })).status).toBe('SHIPPED')
  })

  it('returned → RETURNED', () => {
    expect(transformOrderFromServiceOrder(makeRaw({ status: 'returned' })).status).toBe('RETURNED')
  })

  it('cancelled → CANCELLED', () => {
    expect(transformOrderFromServiceOrder(makeRaw({ status: 'cancelled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps store_code to warehouseId', () => {
    expect(transformOrderFromServiceOrder(makeRaw()).warehouseId).toBe('WH-EAST')
  })

  it('maps notes', () => {
    expect(transformOrderFromServiceOrder(makeRaw()).notes).toBe('Fragile')
  })

  it('maps destination address from flat contact fields', () => {
    const result = transformOrderFromServiceOrder(makeRaw())
    expect(result.destinationAddress?.name).toBe('Alice Smith')
    expect(result.destinationAddress?.street1).toBe('789 Elm St')
  })

  it('maps lineItems from items array', () => {
    const result = transformOrderFromServiceOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-ABC')
    expect(result.lineItems![0].name).toBe('Widget')
    expect(result.lineItems![0].quantity).toBe(3)
  })

  it('lineItems is undefined when items is empty', () => {
    const result = transformOrderFromServiceOrder(makeRaw({ items: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('parses createdAt as Date', () => {
    expect(transformOrderFromServiceOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrderFromServiceOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformOrderFromServiceOrder(raw).metadata).toBe(raw)
  })
})
