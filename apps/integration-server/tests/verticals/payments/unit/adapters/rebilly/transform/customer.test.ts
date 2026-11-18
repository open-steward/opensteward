import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

// Customer.yaml: email, firstName, lastName, customFields, createdTime, updatedTime.
describe('rebilly transformCustomer', () => {
  it('maps the documented fields', () => {
    const c = CustomerSchema.parse(
      transformCustomer({
        id: 'cus_0YV7DDSDD1C8DA64KHH2W33CPF',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        customFields: { tier: 'gold' },
        createdTime: '2026-01-15T09:30:00Z',
        updatedTime: '2026-01-16T09:30:00Z',
      }),
    )
    expect(c).toMatchObject({
      id: 'cus_0YV7DDSDD1C8DA64KHH2W33CPF',
      email: 'jane@example.com',
      name: 'Jane Doe',
      metadata: { tier: 'gold' },
      updatedAt: '2026-01-16T09:30:00Z',
    })
  })

  it('leaves name and email absent when null', () => {
    const c = CustomerSchema.parse(
      transformCustomer({ id: 'cus_1', email: null, firstName: null, lastName: null }),
    )
    expect(c.name).toBeUndefined()
    expect(c.email).toBeUndefined()
  })

  it('throws without an id', () => {
    expect(() => transformCustomer({})).toThrow(/id/)
  })
})
