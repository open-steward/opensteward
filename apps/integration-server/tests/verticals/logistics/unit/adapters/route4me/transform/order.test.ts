import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type Route4MeOrder,
} from '../../../../../../../src/verticals/logistics/adapters/route4me/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<Route4MeOrder> = {}): Route4MeOrder {
  return {
    order_id: 'ORD-100',
    order_status_id: 3,
    order_status: 'shipped',
    tracking_number: 'TRACK-001',
    member_id: 'MEM-42',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+15555550001',
    email: 'jane@example.com',
    address_1: '1 Main St',
    address_city: 'Austin',
    address_state_id: 'TX',
    address_country_id: 'US',
    address_zip: '78701',
    order_date: '2024-03-01T00:00:00Z',
    ext_field_custom_data: 'priority order',
    ...overrides,
  }
}

describe('route4me transformOrder', () => {
  it('maps id from order_id', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('ORD-100')
    expect(r.orderNumber).toBe('ORD-100')
  })

  it('maps customerId from member_id', () => {
    const r = transformOrder(makeOrder())
    expect(r.customerId).toBe('MEM-42')
  })

  it('maps destination address fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.destinationAddress?.city).toBe('Austin')
    expect(r.destinationAddress?.state).toBe('TX')
    expect(r.destinationAddress?.postalCode).toBe('78701')
  })

  it('maps notes from ext_field_custom_data', () => {
    const r = transformOrder(makeOrder())
    expect(r.notes).toBe('priority order')
  })

  it('maps order_date to orderAt and createdAt as Date', () => {
    const r = transformOrder(makeOrder())
    expect(r.orderAt).toBeInstanceOf(Date)
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('preserves raw metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps status via statusId when order_status is empty', () => {
    // statusId 3 → SHIPPED when order_status is blank
    const r = transformOrder(makeOrder({ order_status: '', order_status_id: 3 }))
    expect(r.status).toBe('SHIPPED')
  })

  it('maps status via order_status string for delivered', () => {
    const r = transformOrder(makeOrder({ order_status: 'delivered', order_status_id: undefined }))
    expect(r.status).toBe('DELIVERED')
  })

  it('maps status via order_status string for cancelled', () => {
    const r = transformOrder(makeOrder({ order_status: 'cancelled', order_status_id: undefined }))
    expect(r.status).toBe('CANCELLED')
  })

  it('defaults status to PENDING when unknown', () => {
    const r = transformOrder(makeOrder({ order_status: 'xyzzy', order_status_id: undefined }))
    expect(r.status).toBe('PENDING')
  })

  it('handles missing optional fields gracefully', () => {
    const r = transformOrder(
      makeOrder({
        order_id: undefined,
        member_id: undefined,
        ext_field_custom_data: undefined,
        order_date: undefined,
      }),
    )
    expect(r.id).toBeUndefined()
    expect(r.customerId).toBeUndefined()
    expect(r.notes).toBeUndefined()
    expect(r.orderAt).toBeUndefined()
  })

  it('concatenates first_name and last_name into address name', () => {
    const r = transformOrder(makeOrder())
    expect(r.destinationAddress?.name).toBe('Jane Doe')
  })

  it('falls back to address_alias for address name when no first/last', () => {
    const r = transformOrder(
      makeOrder({ first_name: null, last_name: null, address_alias: 'Home Depot' }),
    )
    expect(r.destinationAddress?.name).toBe('Home Depot')
  })

  it('coerces numeric order_id to string', () => {
    const r = transformOrder(makeOrder({ order_id: 99 }))
    expect(r.id).toBe('99')
  })
})
