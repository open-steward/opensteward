import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/rebill/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'
import { documentedCustomer } from '../fixtures/documented'

describe('rebill transformCustomer', () => {
  it('maps the documented customer object', () => {
    const c = CustomerSchema.parse(transformCustomer(documentedCustomer()))
    expect(c.id).toBe('cus_786176c9d39f40d8af98428edb2aa3db')
    expect(c.externalId).toBe('cus_786176c9d39f40d8af98428edb2aa3db')
    expect(c.name).toBe('Ana Lopez')
    expect(c.email).toBe('ana@example.com')
    expect(c.metadata).toEqual({ internal_id: 'customer_9182' })
    expect(c.createdAt).toBe('2026-04-02T10:12:00.000Z')
    expect(c.gateway).toBe('rebill')
  })

  it('treats null metadata ("`null` when not set") as empty', () => {
    const c = CustomerSchema.parse(transformCustomer({ ...documentedCustomer(), metadata: null }))
    expect(c.metadata).toEqual({})
  })

  it('throws on a customer without an id', () => {
    expect(() => transformCustomer({ ...documentedCustomer(), id: '' })).toThrow(/no id/)
  })
})
