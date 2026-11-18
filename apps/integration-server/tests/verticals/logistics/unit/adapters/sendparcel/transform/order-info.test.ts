/**
 * Fixture: the `POST /rest-api/orders/infos` 200 schema from the spec embedded in
 * https://api.sendparcel.com/rest-api/doc (the spec gives field descriptions,
 * not an example body, so the values are illustrative and every key is documented).
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrderInfo,
  type SendParcelOrderInfo,
} from '../../../../../../../src/verticals/logistics/adapters/sendparcel/transform/order-info'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeInfo(overrides: Partial<SendParcelOrderInfo> = {}): SendParcelOrderInfo {
  return {
    id: '123456',
    status: 0,
    tracking_number: 'JD0002231234567890',
    created_date: '2026-03-01 10:15:00',
    shipper: {
      name: 'Jonas Jonaitis',
      company: 'UAB Siuntėjas',
      address1: 'Gedimino pr. 1',
      address2: '',
      city: 'Vilnius',
      state: '',
      postal_code: '01103',
      phone: '+37060000000',
      country: 'LT',
    },
    recipient: {
      name: 'Anna Berzina',
      company: '',
      address1: 'Brivibas iela 10',
      address2: 'dz. 5',
      city: 'Riga',
      state: '',
      postal_code: 'LV-1010',
      phone: '+37120000000',
      country: 'LV',
    },
    parcels: [{ weight: 2.5, length: 30, width: 20, height: 10 }],
    ...overrides,
  }
}

describe('transformOrderInfo', () => {
  it('maps the documented body onto a valid Order', () => {
    const order = OrderSchema.parse(transformOrderInfo(makeInfo()))
    expect(order.id).toBe('123456')
    expect(order.status).toBe('PROCESSING')
    expect(order.originAddress).toEqual({
      name: 'Jonas Jonaitis',
      company: 'UAB Siuntėjas',
      street1: 'Gedimino pr. 1',
      city: 'Vilnius',
      postalCode: '01103',
      phone: '+37060000000',
      country: 'LT',
    })
    expect(order.destinationAddress).toEqual({
      name: 'Anna Berzina',
      street1: 'Brivibas iela 10',
      street2: 'dz. 5',
      city: 'Riga',
      postalCode: 'LV-1010',
      phone: '+37120000000',
      country: 'LV',
    })
  })

  it.each([
    [0, 'PROCESSING'],
    [1, 'PENDING'],
    [2, 'unknown'],
    [3, 'PROCESSING'],
    [4, 'CANCELLED'],
  ] as const)('maps documented status %i to %s', (code, expected) => {
    expect(OrderSchema.parse(transformOrderInfo(makeInfo({ status: code }))).status).toBe(expected)
  })

  it('does not turn the zone-less created_date into createdAt, and keeps it in metadata', () => {
    const order = OrderSchema.parse(transformOrderInfo(makeInfo()))
    expect(order.createdAt).toBeUndefined()
    expect(order.metadata?.created_date).toBe('2026-03-01 10:15:00')
    expect(order.metadata?.tracking_number).toBe('JD0002231234567890')
  })

  it('invents nothing when optional parts are missing', () => {
    const order = OrderSchema.parse(transformOrderInfo({ id: '7' }))
    expect(order).toEqual({ id: '7', metadata: { id: '7' } })
  })

  it('leaves id unset rather than inventing one when the body has no id', () => {
    const order = OrderSchema.parse(transformOrderInfo({ status: 1 }))
    expect(order.id).toBeUndefined()
    expect(order).toEqual({ status: 'PENDING', metadata: { status: 1 } })
  })
})
