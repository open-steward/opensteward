import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/onro/transform/order'
import type { OnroOrder } from '../../../../../../../src/verticals/logistics/adapters/onro/transform/tracking'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeOnroOrder(overrides: Partial<OnroOrder> = {}): OnroOrder {
  return {
    id: 'ord-1234',
    order_id: 'ORD-EXT-001',
    status: 'in_transit',
    pickup_address: {
      full_name: 'Alice Sender',
      address1: '10 Origin Lane',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'US',
      phone: '+15125550100',
      email: 'alice@example.com',
    },
    dropoff_address: {
      full_name: 'Bob Receiver',
      address1: '99 Destination Blvd',
      city: 'Dallas',
      state: 'TX',
      postal_code: '75201',
      country: 'US',
      phone: '+12145550200',
      email: 'bob@example.com',
    },
    notes: 'Handle with care',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T08:30:00Z',
    ...overrides,
  }
}

// ─── transformOrder ───────────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('maps id and orderNumber', () => {
    const raw = makeOnroOrder()
    const result = transformOrder(raw)

    expect(result.id).toBe('ord-1234')
    expect(result.orderNumber).toBe('ORD-EXT-001')
  })

  it('maps notes and createdAt / updatedAt', () => {
    const raw = makeOnroOrder()
    const result = transformOrder(raw)

    expect(result.notes).toBe('Handle with care')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt?.toISOString()).toBe('2024-03-02T08:30:00.000Z')
  })

  it('maps origin address fields', () => {
    const raw = makeOnroOrder()
    const result = transformOrder(raw)

    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Austin')
    expect(result.originAddress?.state).toBe('TX')
    expect(result.originAddress?.postalCode).toBe('78701')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destination address fields', () => {
    const raw = makeOnroOrder()
    const result = transformOrder(raw)

    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Dallas')
    expect(result.destinationAddress?.postalCode).toBe('75201')
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeOnroOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps order statuses correctly', () => {
    const cases: [string, string][] = [
      ['pending', 'PENDING'],
      ['created', 'PENDING'],
      ['new_order', 'PENDING'],
      ['assigned', 'PROCESSING'],
      ['accepted', 'PROCESSING'],
      ['pickedup', 'SHIPPED'],
      ['picked_up', 'SHIPPED'],
      ['in_transit', 'SHIPPED'],
      ['on_the_way', 'SHIPPED'],
      ['out_for_delivery', 'SHIPPED'],
      ['delivering', 'SHIPPED'],
      ['near_customer', 'SHIPPED'],
      ['delivered', 'DELIVERED'],
      ['completed', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['rejected', 'CANCELLED'],
      ['something_unknown', 'PENDING'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeOnroOrder({ status })
      expect(transformOrder(raw).status, `status: ${status}`).toBe(expected)
    }
  })

  it('defaults status to PENDING when status is null', () => {
    const raw = makeOnroOrder({ status: null })
    expect(transformOrder(raw).status).toBe('PENDING')
  })

  it('omits orderNumber when order_id is absent', () => {
    const raw = makeOnroOrder({ order_id: undefined })
    expect(transformOrder(raw).orderNumber).toBeUndefined()
  })

  it('omits notes when notes is not a string', () => {
    const raw = makeOnroOrder({ notes: 123 as unknown as string })
    expect(transformOrder(raw).notes).toBeUndefined()
  })

  it('omits addresses when pickup_address / dropoff_address are null', () => {
    const raw = makeOnroOrder({ pickup_address: null, dropoff_address: null })
    const result = transformOrder(raw)
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('coerces numeric id to string', () => {
    const raw = makeOnroOrder({ id: 9876 })
    expect(transformOrder(raw).id).toBe('9876')
  })

  it('result passes OrderSchema.parse without throwing', () => {
    const raw = makeOnroOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
