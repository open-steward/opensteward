import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type FlashExpressOrder,
} from '../../../../../src/verticals/logistics/adapters/flash-express/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<FlashExpressOrder> = {}): FlashExpressOrder {
  return {
    order_id: 'ord-abc-123',
    tracking_number: 'TH123456789',
    status: 'PICKUP_PENDING',
    label_url: 'https://open.flashexpress.com/labels/ord-abc-123.pdf',
    service_code: 'STANDARD',
    weight: 2.0,
    weight_unit: 'kg',
    sender: {
      name: 'Somchai',
      address_line1: '123 Sukhumvit Road',
      city: 'Bangkok',
      postal_code: '10110',
      country: 'TH',
    },
    recipient: {
      name: 'Nattapong',
      address_line1: '456 Chiang Mai Road',
      city: 'Chiang Mai',
      postal_code: '50000',
      country: 'TH',
    },
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.id).toBe('ord-abc-123')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('TH123456789')
    expect(result.carrierId).toBe('flash-express')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('ord-abc-123.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Somchai')
    expect(result.originAddress?.city).toBe('Bangkok')
    expect(result.destinationAddress?.name).toBe('Nattapong')
    expect(result.destinationAddress?.city).toBe('Chiang Mai')
  })

  it('maps weight', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeOrder({
      weight: null,
      weight_unit: null,
      label_url: null,
      sender: null,
      recipient: null,
      service_code: null,
      status: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['PICKUP_PENDING', 'PENDING'],
      ['PICKED_UP', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeOrder({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
