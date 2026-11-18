import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/paydock/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'
import { DOC_CUSTOMER } from '../fixtures/docs'

describe('paydock transformCustomer', () => {
  it('maps the documented customers/get example', () => {
    const c = CustomerSchema.parse(transformCustomer(DOC_CUSTOMER))
    expect(c.id).toBe('620628ed41f03d6f3f87fbf1')
    expect(c.externalId).toBe('620628ed41f03d6f3f87fbf1')
    expect(c.name).toBe('Test Last')
    expect(c.defaultPaymentMethodId).toBe('620628ef41f03d6f3f87fbf2')
    expect(c.createdAt).toBe('2022-02-11T09:14:23.282Z')
    expect(c.updatedAt).toBe('2022-02-11T09:14:23.282Z')
    expect(c.metadata).toEqual({})
    expect(c.gateway).toBe('paydock')
  })

  it('reads email and phone, and leaves name unset without first/last names', () => {
    const c = CustomerSchema.parse(
      transformCustomer({
        _id: '5ece59dc9c49c657d60630ed',
        email: 'a@example.com',
        phone: '+12345678901',
      }),
    )
    expect(c.email).toBe('a@example.com')
    expect(c.phone).toBe('+12345678901')
    expect(c.name).toBeUndefined()
  })

  it('throws on a row without _id instead of inventing one', () => {
    expect(() => transformCustomer({ first_name: 'x' })).toThrow(/_id/)
  })

  it('maps description and drops empty documented strings', () => {
    const c = CustomerSchema.parse(
      transformCustomer({ ...DOC_CUSTOMER, description: 'VIP', email: '', phone: '' }),
    )
    expect(c.description).toBe('VIP')
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
  })
})
