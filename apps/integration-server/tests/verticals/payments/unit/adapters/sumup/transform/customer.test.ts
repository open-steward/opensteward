import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/sumup/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'
import { CUSTOMER } from '../fixtures'

describe('sumup transformCustomer', () => {
  it('maps the documented Customer example', () => {
    const c = CustomerSchema.parse(transformCustomer(CUSTOMER))
    expect(c.id).toBe('831ff8d4cd5958ab5670')
    expect(c.externalId).toBe('831ff8d4cd5958ab5670')
    expect(c.name).toBe('John Doe')
    expect(c.email).toBe('user@example.com')
    expect(c.phone).toBe('+491635559723')
    expect(c.gateway).toBe('sumup')
  })

  it('leaves name unset when personal_details is absent', () => {
    const c = CustomerSchema.parse(transformCustomer({ customer_id: 'c1' }))
    expect(c.name).toBeUndefined()
  })

  it('throws on a missing customer_id', () => {
    expect(() => transformCustomer({ customer_id: '' })).toThrow(/customer_id/)
  })
})
