import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type Parcel2GoOrderResponse,
} from '../../../../../../../src/verticals/logistics/adapters/parcel2go/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrderResponse(
  overrides: Partial<Parcel2GoOrderResponse> = {},
): Parcel2GoOrderResponse {
  return {
    OrderId: 'P2G-ORD-001',
    Hash: 'abc123hash',
    OrderlineIdMap: { '1': 'OL-001', '2': 'OL-002' },
    TotalPrice: 12.99,
    OrderLineId: 'OL-001',
    CollectionAddress: {
      Name: 'Sender Co',
      Street: '10 Sender Lane',
      Town: 'London',
      Postcode: 'EC1A 1BB',
      Country: 'GB',
    },
    DeliveryAddress: {
      Name: 'Receiver Ltd',
      Street: '20 Receiver Ave',
      Town: 'Bristol',
      Postcode: 'BS1 1AA',
      Country: 'GB',
    },
    CreatedAt: '2024-03-01T00:00:00Z',
    Slug: 'evri-parcelshop',
    ...overrides,
  }
}

// ─── transformOrder ───────────────────────────────────────────────────────────

describe('parcel2go transformOrder', () => {
  it('maps id from OrderId', () => {
    expect(transformOrder(makeOrderResponse()).id).toBe('P2G-ORD-001')
  })

  it('maps orderNumber from OrderId', () => {
    expect(transformOrder(makeOrderResponse()).orderNumber).toBe('P2G-ORD-001')
  })

  it('collects shipmentIds from OrderlineIdMap values', () => {
    const r = transformOrder(makeOrderResponse())
    expect(r.shipmentIds).toContain('OL-001')
    expect(r.shipmentIds).toContain('OL-002')
    expect(r.shipmentIds).toHaveLength(2)
  })

  it('falls back shipmentIds to [OrderLineId] when map is null', () => {
    const r = transformOrder(makeOrderResponse({ OrderlineIdMap: null }))
    expect(r.shipmentIds).toEqual(['OL-001'])
  })

  it('maps requestedServiceCode from Slug', () => {
    expect(transformOrder(makeOrderResponse()).requestedServiceCode).toBe('evri-parcelshop')
  })

  it('maps origin address name from CollectionAddress', () => {
    expect(transformOrder(makeOrderResponse()).originAddress?.name).toBe('Sender Co')
  })

  it('maps destination address name from DeliveryAddress', () => {
    expect(transformOrder(makeOrderResponse()).destinationAddress?.name).toBe('Receiver Ltd')
  })

  it('parses CreatedAt as a Date', () => {
    expect(transformOrder(makeOrderResponse()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as raw object', () => {
    const raw = makeOrderResponse()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrderResponse()))).not.toThrow()
  })
})
