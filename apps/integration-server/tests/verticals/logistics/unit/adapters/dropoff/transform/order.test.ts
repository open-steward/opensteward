import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/dropoff/transform/order'
import type { DropoffOrder } from '../../../../../../../src/verticals/logistics/adapters/dropoff/transform/tracking'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(o: Partial<DropoffOrder> = {}): DropoffOrder {
  return {
    order_id: 'do-ord-001',
    order_status_code: 'delivered',
    tracking_number: 'TRK-ORD-001',
    pickup_address: {
      name: 'Origin',
      street1: '10 Origin Ave',
      city: 'Seattle',
      state: 'WA',
      country: 'US',
    },
    dropoff_address: {
      name: 'Dest',
      street1: '20 Dest Blvd',
      city: 'Portland',
      state: 'OR',
      country: 'US',
    },
    delivery_instructions: 'Call on arrival',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T10:00:00Z',
    ...o,
  }
}

describe('dropoff transformOrder', () => {
  it('maps order_id to id', () => {
    expect(transformOrder(makeOrder()).id).toBe('do-ord-001')
  })

  it('orderNumber is string of order_id', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('do-ord-001')
  })

  it('delivered → DELIVERED', () => {
    expect(transformOrder(makeOrder()).status).toBe('DELIVERED')
  })

  it('pending → PENDING', () => {
    expect(transformOrder(makeOrder({ order_status_code: 'pending' })).status).toBe('PENDING')
  })

  it('assigned → PROCESSING', () => {
    expect(transformOrder(makeOrder({ order_status_code: 'assigned' })).status).toBe('PROCESSING')
  })

  it('in_transit → SHIPPED', () => {
    expect(transformOrder(makeOrder({ order_status_code: 'in_transit' })).status).toBe('SHIPPED')
  })

  it('returned → RETURNED', () => {
    expect(transformOrder(makeOrder({ order_status_code: 'returned' })).status).toBe('RETURNED')
  })

  it('cancelled → CANCELLED', () => {
    expect(transformOrder(makeOrder({ order_status_code: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('unknown status → undefined', () => {
    expect(transformOrder(makeOrder({ order_status_code: 'bogus_state' })).status).toBeUndefined()
  })

  it('maps originAddress from pickup_address', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.name).toBe('Origin')
    expect(result.originAddress?.city).toBe('Seattle')
  })

  it('maps destinationAddress from dropoff_address', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Dest')
    expect(result.destinationAddress?.city).toBe('Portland')
  })

  it('maps delivery_instructions to notes', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Call on arrival')
  })

  it('parses createdAt as Date', () => {
    expect(transformOrder(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw order', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
