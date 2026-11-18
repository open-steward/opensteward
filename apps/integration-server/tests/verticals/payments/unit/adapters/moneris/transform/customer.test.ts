import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/moneris/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'
import { CUSTOMER } from '../fixtures'

describe('moneris transformCustomer', () => {
  it('maps the documented customer fields', () => {
    const c = CustomerSchema.parse(transformCustomer(CUSTOMER))
    expect(c.id).toBe('ci0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(c.externalId).toBe('ci0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(c.name).toBe('John J. Doe')
    expect(c.email).toBe('moneris@moneris.com')
    expect(c.phone).toBe('+18663197450')
    expect(c.createdAt).toBe('2019-07-30T06:43:40.252Z')
    expect(c.updatedAt).toBe('2019-07-30T06:43:40.252Z')
    expect(c.gateway).toBe('moneris')
  })

  it('names a customer with no person name by companyName', () => {
    const c = CustomerSchema.parse(
      transformCustomer({ ...CUSTOMER, firstName: null, middleName: null, lastName: null }),
    )
    expect(c.name).toBe('SP Ltd')
  })

  it('maps customData to metadata and a null modifiedAt to no updatedAt', () => {
    const c = CustomerSchema.parse(
      transformCustomer({ ...CUSTOMER, modifiedAt: null, customData: { tier: 'gold' } }),
    )
    expect(c.metadata).toEqual({ tier: 'gold' })
    expect(c.updatedAt).toBeUndefined()
  })

  it('throws on a customer without customerId', () => {
    expect(() => transformCustomer({ ...CUSTOMER, customerId: '' })).toThrow(/customerId/)
  })
})
