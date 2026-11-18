import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/storehippo/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import { USER } from '../fixtures'

describe('StoreHippo transformCustomer (documented ms-users fields)', () => {
  it('maps the documented example and parses with CustomerSchema', () => {
    const c = CustomerSchema.parse(transformCustomer(structuredClone(USER)))
    expect(c).toMatchObject({
      id: '5d81e23701808dd8dfe3201f',
      email: 'john@storehippo.com',
      firstName: 'John',
      lastName: 'Neon',
      phone: '+91987654321',
      createdAt: '2014-08-26T12:09:05.008Z',
    })
  })

  it('reads total_order_count as ordersCount', () => {
    const c = CustomerSchema.parse(
      transformCustomer({ ...structuredClone(USER), total_order_count: 4 }),
    )
    expect(c.ordersCount).toBe(4)
  })

  it('throws on a record without _id', () => {
    expect(() => transformCustomer({ email: 'a@b.co' })).toThrow(/_id/)
  })

  it('untransformCustomer keeps the email', () => {
    expect(untransformCustomer({ email: 'john@storehippo.com' })['email']).toBe(
      'john@storehippo.com',
    )
  })
})
