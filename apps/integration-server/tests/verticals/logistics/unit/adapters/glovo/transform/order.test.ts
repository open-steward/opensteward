import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type GlovoOrder,
  type GlovoOrderAddress,
} from '../../../../../../../src/verticals/logistics/adapters/glovo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeAddress(overrides: Partial<GlovoOrderAddress> = {}): GlovoOrderAddress {
  return {
    lat: 41.3851,
    lon: 2.1734,
    label: '10 Delivery Street, Barcelona',
    details: 'Ring doorbell',
    contactPerson: 'Maria Garcia',
    contactPhone: '+34600123456',
    ...overrides,
  }
}

function makePickupAddress(overrides: Partial<GlovoOrderAddress> = {}): GlovoOrderAddress {
  return {
    lat: 41.39,
    lon: 2.17,
    label: 'pickup point, Gran Via',
    details: 'Side entrance',
    contactPerson: 'Carlos Lopez',
    contactPhone: '+34600654321',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<GlovoOrder> = {}): GlovoOrder {
  return {
    id: 'GLV-001',
    state: 'IN_TRANSIT',
    description: 'Urgent documents',
    scheduleTime: '2024-03-01T00:00:00Z',
    total: { amount: 1250, currency: 'EUR' },
    addresses: [makePickupAddress(), makeAddress()],
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-03-01T09:30:00Z',
    ...overrides,
  }
}

describe('Glovo transformOrder', () => {
  it('maps id from raw.id', () => {
    expect(transformOrder(makeOrder()).id).toBe('GLV-001')
  })

  it('maps orderNumber from raw.id', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('GLV-001')
  })

  it('maps IN_TRANSIT state → SHIPPED status', () => {
    expect(transformOrder(makeOrder({ state: 'IN_TRANSIT' })).status).toBe('SHIPPED')
  })

  it('maps ON_THE_WAY state → SHIPPED status', () => {
    expect(transformOrder(makeOrder({ state: 'ON_THE_WAY' })).status).toBe('SHIPPED')
  })

  it('maps PENDING state → PENDING status', () => {
    expect(transformOrder(makeOrder({ state: 'PENDING' })).status).toBe('PENDING')
  })

  it('maps SCHEDULED state → PENDING status', () => {
    expect(transformOrder(makeOrder({ state: 'SCHEDULED' })).status).toBe('PENDING')
  })

  it('maps ACCEPTED state → PROCESSING status', () => {
    expect(transformOrder(makeOrder({ state: 'ACCEPTED' })).status).toBe('PROCESSING')
  })

  it('maps PICKING state → PROCESSING status', () => {
    expect(transformOrder(makeOrder({ state: 'PICKING' })).status).toBe('PROCESSING')
  })

  it('maps DELIVERED state → DELIVERED status', () => {
    expect(transformOrder(makeOrder({ state: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps CANCELED state → CANCELLED status', () => {
    expect(transformOrder(makeOrder({ state: 'CANCELED' })).status).toBe('CANCELLED')
  })

  it('maps CANCELLED state → CANCELLED status', () => {
    expect(transformOrder(makeOrder({ state: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps unknown state → UNKNOWN status', () => {
    expect(transformOrder(makeOrder({ state: 'UNKNOWN_STATE' })).status).toBe('UNKNOWN')
  })

  it('maps currency from total.currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('maps totalAmount from total.amount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1250)
  })

  it('maps notes from description', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Urgent documents')
  })

  it('sets destinationAddress from non-pickup address', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Maria Garcia')
    expect(result.destinationAddress?.street1).toBe('10 Delivery Street, Barcelona')
    expect(result.destinationAddress?.phone).toBe('+34600123456')
  })

  it('sets originAddress from pickup address', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.name).toBe('Carlos Lopez')
    expect(result.originAddress?.street1).toBe('pickup point, Gran Via')
    expect(result.originAddress?.phone).toBe('+34600654321')
  })

  it('maps createdAt from createdAt field', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from updatedAt field', () => {
    const result = transformOrder(makeOrder())
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('falls back to scheduleTime for createdAt when createdAt is missing', () => {
    const result = transformOrder(makeOrder({ createdAt: null }))
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('handles missing addresses array gracefully', () => {
    const result = transformOrder(makeOrder({ addresses: undefined }))
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('handles missing total gracefully', () => {
    const result = transformOrder(makeOrder({ total: null }))
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces output that parses against OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
