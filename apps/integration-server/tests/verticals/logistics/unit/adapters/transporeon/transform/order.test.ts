import { describe, it, expect } from 'vitest'
import {
  transformDelivery,
  extractDeliveries,
  type TransporeonDeliveryDto,
  type TransporeonDeliveryListResponse,
} from '../../../../../../../src/verticals/logistics/adapters/transporeon/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<TransporeonDeliveryDto> = {}): TransporeonDeliveryDto {
  return {
    id: '42',
    number: 'DEL-0042',
    shipper_id: 'shp-1',
    shipper_name: 'Acme Logistics',
    transport_id: 'transport-99',
    status: 'PENDING',
    qualifier: 'tour.routed',
    timestamp: '2024-03-01T00:00:00Z',
    reference: 'REF-001',
    customer_name: 'Tester Corp',
    comment_plain_text: 'Handle with care',
    currency_id: 'EUR',
    price_basic: 250.5,
    loading_company: 'Origin Co',
    loading_address: '1 Loading St',
    loading_zip: '10115',
    loading_city: 'Berlin',
    loading_region: 'BE',
    loading_country_id: 'DE',
    loading_from_date: '2024-03-01',
    loading_from_time: '08:00:00',
    unloading_company: 'Dest Co',
    unloading_address: '2 Unloading Ave',
    unloading_zip: '75001',
    unloading_city: 'Paris',
    unloading_region: 'IDF',
    unloading_country_id: 'FR',
    unloading_until_date: '2024-03-03',
    unloading_until_time: '17:00:00',
    items: [{ id: 'item-1', number: 1, description: 'Pallet of goods', quantity: 10, weight: 500 }],
    ...overrides,
  }
}

describe('transporeon transformDelivery', () => {
  it('maps id and orderNumber', () => {
    const result = transformDelivery(makeRaw())
    expect(result.id).toBe('42')
    expect(result.orderNumber).toBe('DEL-0042')
  })

  it('maps "tour.routed" qualifier to AWAITING_SHIPMENT', () => {
    expect(transformDelivery(makeRaw({ qualifier: 'tour.routed' })).status).toBe(
      'AWAITING_SHIPMENT',
    )
  })

  it('maps "tour.accepted" qualifier to PROCESSING', () => {
    expect(transformDelivery(makeRaw({ qualifier: 'tour.accepted' })).status).toBe('PROCESSING')
  })

  it('maps "tour.assigned.cancelled" qualifier to CANCELLED', () => {
    expect(transformDelivery(makeRaw({ qualifier: 'tour.assigned.cancelled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps DELIVERED status directly', () => {
    expect(transformDelivery(makeRaw({ qualifier: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('falls back to PENDING for unknown qualifier/status', () => {
    expect(transformDelivery(makeRaw({ qualifier: undefined, status: undefined })).status).toBe(
      'PENDING',
    )
  })

  it('maps customerId from shipper_id', () => {
    expect(transformDelivery(makeRaw()).customerId).toBe('shp-1')
  })

  it('maps shipmentIds from transport_id', () => {
    expect(transformDelivery(makeRaw()).shipmentIds).toEqual(['transport-99'])
  })

  it('builds origin address from loading_* fields', () => {
    const result = transformDelivery(makeRaw())
    expect(result.originAddress?.city).toBe('Berlin')
    expect(result.originAddress?.country).toBe('DE')
    expect(result.originAddress?.company).toBe('Origin Co')
  })

  it('builds destination address from unloading_* fields', () => {
    const result = transformDelivery(makeRaw())
    expect(result.destinationAddress?.city).toBe('Paris')
    expect(result.destinationAddress?.country).toBe('FR')
  })

  it('converts price_basic to minor units (×100)', () => {
    // 250.5 → Math.round(250.5 * 100) = 25050
    expect(transformDelivery(makeRaw()).totalAmount).toBe(25050)
  })

  it('maps currency from currency_id', () => {
    expect(transformDelivery(makeRaw()).currency).toBe('EUR')
  })

  it('maps notes from comment_plain_text', () => {
    expect(transformDelivery(makeRaw()).notes).toBe('Handle with care')
  })

  it('maps lineItems from items array', () => {
    const result = transformDelivery(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].name).toBe('Pallet of goods')
    expect(result.lineItems![0].quantity).toBe(10)
  })

  it('sets shippedAt and deliveredAt from loading/unloading date+time', () => {
    const result = transformDelivery(makeRaw())
    expect(result.shippedAt).toBeInstanceOf(Date)
    expect(result.deliveredAt).toBeInstanceOf(Date)
  })

  it('sets createdAt from timestamp', () => {
    expect(transformDelivery(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformDelivery(makeRaw()))).not.toThrow()
  })

  it('omits totalAmount when price_basic is null', () => {
    expect(transformDelivery(makeRaw({ price_basic: null })).totalAmount).toBeUndefined()
  })

  it('omits totalAmount when price_basic is 0', () => {
    expect(transformDelivery(makeRaw({ price_basic: 0 })).totalAmount).toBeUndefined()
  })

  it('omits originAddress when all loading fields are absent', () => {
    const result = transformDelivery(
      makeRaw({
        loading_company: undefined,
        loading_address: undefined,
        loading_zip: undefined,
        loading_city: undefined,
        loading_country_id: undefined,
      }),
    )
    expect(result.originAddress).toBeUndefined()
  })
})

describe('transporeon extractDeliveries', () => {
  it('extracts from "delivery" key', () => {
    const response: TransporeonDeliveryListResponse = { delivery: [makeRaw()] }
    expect(extractDeliveries(response)).toHaveLength(1)
  })

  it('extracts from "deliveries" key when "delivery" is absent', () => {
    const response: TransporeonDeliveryListResponse = { deliveries: [makeRaw(), makeRaw()] }
    expect(extractDeliveries(response)).toHaveLength(2)
  })

  it('returns empty array when both keys are absent', () => {
    expect(extractDeliveries({})).toHaveLength(0)
  })
})
