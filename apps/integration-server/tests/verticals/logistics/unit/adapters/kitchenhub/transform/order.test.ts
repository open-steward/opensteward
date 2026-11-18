import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { documentedOrder } from '../fixtures/documented'

describe('kitchenhub transformOrder (OrderModel)', () => {
  it('parses with OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(documentedOrder()))).not.toThrow()
  })

  it('maps order.id (an integer) to a string id and order.number to orderNumber', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(o.id).toBe('5501505922269184')
    expect(o.orderNumber).toBe('201523913381757')
  })

  it('maps store.id to warehouseId and order.notes to notes', () => {
    const o = transformOrder(documentedOrder())
    expect(o.warehouseId).toBe('c212a250-3b69-45ab-9184-03fb2072x7xx')
    expect(o.notes).toBe("Contactless delivery, Please don't ring the doorbell.")
  })

  it('maps delivery.address to destinationAddress', () => {
    expect(transformOrder(documentedOrder()).destinationAddress).toEqual({
      street1: '1234 Bettstrail Way',
      city: 'Rockville',
      state: 'MD',
      postalCode: '20854',
      country: 'US',
    })
  })

  it('leaves out a country that is not an ISO 3166 alpha-2 code', () => {
    const raw = documentedOrder()
    raw.delivery = { address: { ...raw.delivery!.address!, country: 'United States' } }
    const o = OrderSchema.parse(transformOrder(raw))
    expect(o.destinationAddress?.country).toBeUndefined()
    expect(o.destinationAddress?.city).toBe('Rockville')
  })

  it('maps item id, name and quantity, and no amounts (no currency is documented)', () => {
    const o = transformOrder(documentedOrder())
    expect(o.lineItems).toEqual([
      { id: '6035887902', name: '2 Proteins', quantity: 1 },
      { id: '6027293408', name: 'Magic Roll', quantity: 1 },
    ])
    expect(o.currency).toBeUndefined()
    expect(o.totalAmount).toBeUndefined()
  })

  it('maps placed_at, created_at and cancelled_at', () => {
    const o = transformOrder(documentedOrder())
    expect(o.orderAt?.toISOString()).toBe('2023-10-01T22:20:26.000Z')
    expect(o.createdAt?.toISOString()).toBe('2023-10-01T22:21:44.000Z')
    expect(o.cancelledAt).toBeUndefined()
  })

  // The Order Example has unit_number and cancelled_at null, every quantity 1
  // and no updated_at. The OpenAPI documents each of them
  // (ms_api__core_models__Address "unit_number": "Address unit number";
  // ms_api__core_models__Item "quantity": "Item quantity", integer;
  // ms_api__core_models__Timestamps "cancelled_at": "Timestamp cancelled at
  // time", "updated_at": "Timestamp updated at"), so this variant sets them.
  it('maps unit_number, item quantity, cancelled_at and updated_at when present', () => {
    const raw = documentedOrder()
    raw.delivery = { address: { ...raw.delivery!.address!, unit_number: 'Apt 4B' } }
    raw.items = [{ ...raw.items![0]!, quantity: 3 }]
    raw.timestamps = {
      ...raw.timestamps,
      cancelled_at: '2023-10-01T22:40:00Z',
      updated_at: '2023-10-01T22:41:30Z',
    }
    const o = OrderSchema.parse(transformOrder(raw))
    expect(o.destinationAddress?.street2).toBe('Apt 4B')
    expect(o.lineItems?.[0]?.quantity).toBe(3)
    expect(o.cancelledAt?.toISOString()).toBe('2023-10-01T22:40:00.000Z')
    expect(o.updatedAt?.toISOString()).toBe('2023-10-01T22:41:30.000Z')
  })

  it.each([
    ['new', 'PENDING'],
    ['accepted', 'PROCESSING'],
    ['completed', 'DELIVERED'],
    ['canceled', 'CANCELLED'],
    ['something_else', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    const raw = documentedOrder()
    raw.order.status = status
    expect(OrderSchema.parse(transformOrder(raw)).status).toBe(expected)
  })
})
