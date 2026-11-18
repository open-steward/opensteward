/**
 * Fixtures follow IntaSend's documented CustomerSer (OpenAPI "IntaSend API"
 * 1.0.1, embedded in
 * https://developers.intasend.com/reference/api_v1_subscriptions_customers_list):
 *
 *   "CustomerSer":{"type":"object","properties":{"customer_id":…,"email":…,
 *    "first_name":…,"last_name":…,"reference":…,"address":…,"city":…,"state":…,
 *    "zipcode":…,"country":…,"created_at":…,"updated_at":…},
 *    "required":["created_at","customer_id","email","first_name","last_name","updated_at"]}
 *
 * and the example response on
 * https://developers.intasend.com/docs/create-a-subscription-customer-copy.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawIntasendSubscriptionCustomer,
} from '../../../../../../../src/verticals/payments/adapters/intasend/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

/** The documented example response, with its placeholder strings made concrete. */
const DOC: RawIntasendSubscriptionCustomer = {
  customer_id: 'KZQ9DL0',
  email: 'user@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
  reference: 'crm-1042',
  address: '123 Main St',
  city: 'Nairobi',
  state: 'Nairobi',
  zipcode: '00100',
  country: 'KE',
  created_at: '2023-10-09T06:57:02.018Z',
  updated_at: '2023-10-09T06:57:02.018Z',
}

describe('intasend transformCustomer', () => {
  it('maps the documented CustomerSer example', () => {
    const result = CustomerSchema.parse(transformCustomer(DOC))
    expect(result.id).toBe('KZQ9DL0')
    expect(result.externalId).toBe('KZQ9DL0')
    expect(result.email).toBe('user@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.billingAddress).toEqual({
      line1: '123 Main St',
      city: 'Nairobi',
      region: 'Nairobi',
      postalCode: '00100',
      country: 'KE',
    })
    expect(result.metadata).toEqual({ reference: 'crm-1042' })
    expect(result.createdAt).toBe('2023-10-09T06:57:02.018Z')
    expect(result.updatedAt).toBe('2023-10-09T06:57:02.018Z')
    expect(result.gateway).toBe('intasend')
  })

  it('reports no phone or currency: CustomerSer documents neither', () => {
    const result = CustomerSchema.parse(
      transformCustomer({ ...DOC, phone_number: '+254700000000', currency: 'KES' }),
    )
    expect(result.phone).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('omits billingAddress when every documented address field is null', () => {
    const result = CustomerSchema.parse(
      transformCustomer({
        ...DOC,
        address: null,
        city: null,
        state: null,
        zipcode: null,
        country: null,
      }),
    )
    expect(result.billingAddress).toBeUndefined()
  })

  it('reads a blank country ("" is in the documented BlankEnum) as absent', () => {
    const result = CustomerSchema.parse(transformCustomer({ ...DOC, country: '' }))
    expect(result.billingAddress?.country).toBeUndefined()
  })

  it('throws when the required customer_id is missing, never inventing an id', () => {
    const { customer_id: _drop, ...rest } = DOC
    expect(() => transformCustomer({ ...rest, id: 99 } as RawIntasendSubscriptionCustomer)).toThrow(
      /customer_id/,
    )
  })
})
