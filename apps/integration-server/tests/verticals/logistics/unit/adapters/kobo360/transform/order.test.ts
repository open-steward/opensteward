import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type Kobo360OrderResponse,
} from '../../../../../../../src/verticals/logistics/adapters/kobo360/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(o: Partial<Kobo360OrderResponse> = {}): Kobo360OrderResponse {
  return {
    id: 'ord-1',
    order_number: 'KBO-2024-001',
    status: 'IN_TRANSIT',
    customer_id: 'cust-55',
    trip_ids: ['trip-1', 'trip-2'],
    origin: {
      address1: '10 Origin Road',
      city: 'Lagos',
      country: 'NG',
    },
    destination: {
      address1: '20 Dest Road',
      city: 'Abuja',
      country: 'NG',
    },
    currency: 'NGN',
    subtotal: 500000,
    tax: 37500,
    shipping_cost: 25000,
    discount: 0,
    total: 562500,
    notes: 'Handle with care',
    service_code: 'ftl_standard',
    ordered_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...o,
  }
}

describe('kobo360 transformOrder', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-1')
  })

  it('maps order_number to orderNumber', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('KBO-2024-001')
  })

  it('maps IN_TRANSIT status to SHIPPED', () => {
    expect(transformOrder(makeOrder({ status: 'IN_TRANSIT' })).status).toBe('SHIPPED')
  })

  it('maps PENDING status to PENDING', () => {
    expect(transformOrder(makeOrder({ status: 'PENDING' })).status).toBe('PENDING')
  })

  it('maps DELIVERED status to DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps ASSIGNED to AWAITING_SHIPMENT', () => {
    expect(transformOrder(makeOrder({ status: 'ASSIGNED' })).status).toBe('AWAITING_SHIPMENT')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformOrder(makeOrder({ status: 'WEIRD_STATUS' })).status).toBe('UNKNOWN')
  })

  it('maps absent status to UNKNOWN', () => {
    expect(transformOrder(makeOrder({ status: undefined })).status).toBe('UNKNOWN')
  })

  it('maps customer_id', () => {
    expect(transformOrder(makeOrder()).customerId).toBe('cust-55')
  })

  it('maps trip_ids to shipmentIds', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['trip-1', 'trip-2'])
  })

  it('maps origin to originAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.city).toBe('Lagos')
  })

  it('maps destination to destinationAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.city).toBe('Abuja')
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('NGN')
  })

  it('maps notes', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Handle with care')
  })

  it('maps service_code to requestedServiceCode', () => {
    expect(transformOrder(makeOrder()).requestedServiceCode).toBe('ftl_standard')
  })

  it('maps ordered_at to orderAt Date', () => {
    expect(transformOrder(makeOrder()).orderAt).toBeInstanceOf(Date)
  })

  it('attaches metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('validates against OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
