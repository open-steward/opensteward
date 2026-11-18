/**
 * Fixture: the first row of the documented GET /customer response example,
 * https://docs.staxpayments.com/reference/find-all-customers
 */
import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/stax-payments/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

const DOC_ROW = {
  id: '5ff4e048-c9f3-4993-81be-f7253d132c19',
  firstname: 'John',
  lastname: 'Smith',
  company: 'ABC INC',
  email: 'john@abc.com',
  phone: '1234567898',
  reference: '',
  options: null,
  created_at: '2016-04-26 13:52:10',
  updated_at: '2016-04-26 13:52:10',
  deleted_at: null,
  gravatar: '//www.gravatar.com/avatar/144fa42eb34883ecb00cbc3f81a060a1',
}

describe('stax-payments transformCustomer', () => {
  it('maps the documented customer example', () => {
    const c = CustomerSchema.parse(transformCustomer(DOC_ROW))
    expect(c.id).toBe('5ff4e048-c9f3-4993-81be-f7253d132c19')
    expect(c.externalId).toBe(c.id)
    expect(c.name).toBe('John Smith')
    expect(c.email).toBe('john@abc.com')
    expect(c.phone).toBe('1234567898')
    expect(c.createdAt).toBe('2016-04-26T13:52:10.000Z')
    expect(c.updatedAt).toBe('2016-04-26T13:52:10.000Z')
    expect(c.gateway).toBe('stax-payments')
  })

  it('omits a name when neither firstname nor lastname is set', () => {
    const c = CustomerSchema.parse(transformCustomer({ ...DOC_ROW, firstname: null, lastname: '' }))
    expect(c.name).toBeUndefined()
  })

  it('throws on a row without an id rather than inventing one', () => {
    expect(() => transformCustomer({ ...DOC_ROW, id: undefined })).toThrow(/has no id/)
  })
})
