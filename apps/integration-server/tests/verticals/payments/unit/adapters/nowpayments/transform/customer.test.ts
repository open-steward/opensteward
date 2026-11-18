/**
 * Fixture: the "Customer management / Get customers" example of the official
 * collection, https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
 */
import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/nowpayments/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('nowpayments transformCustomer', () => {
  it('maps the documented sub-partner row', () => {
    const c = CustomerSchema.parse(
      transformCustomer({
        id: '111394288',
        name: 'test',
        created_at: '2022-10-06T16:42:47.352Z',
        updated_at: '2022-10-06T16:42:47.352Z',
      }),
    )
    expect(c).toMatchObject({
      id: '111394288',
      externalId: '111394288',
      name: 'test',
      gateway: 'nowpayments',
      metadata: {},
      createdAt: '2022-10-06T16:42:47.352Z',
      updatedAt: '2022-10-06T16:42:47.352Z',
    })
    expect(c.email).toBeUndefined()
  })

  it('throws when id is missing', () => {
    expect(() => transformCustomer({ name: 'x' })).toThrow(/missing id/)
  })
})
