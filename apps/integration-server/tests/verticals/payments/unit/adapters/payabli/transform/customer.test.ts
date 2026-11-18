import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/payabli/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'
import { CUSTOMERS_LIST, CUSTOMER_RECORD } from '../fixtures/documented'

describe('payabli transformCustomer', () => {
  it('maps the documented customer list record', () => {
    const c = CustomerSchema.parse(transformCustomer(CUSTOMERS_LIST.Records[0]))
    expect(c.id).toBe('4440')
    expect(c.externalId).toBe('4440')
    expect(c.name).toBe('Thibodeaux Hebert')
    expect(c.email).toBe('thibodeaux.hebert@bayoumail.com')
    expect(c.phone).toBe('(504) 823-4566')
    expect(c.description).toBe("Boudreaux's Shop")
    expect(c.createdAt).toBe('2023-12-20T13:07:48.000Z')
    expect(c.updatedAt).toBe('2023-12-20T13:07:48.000Z')
  })

  it('maps the documented GET /Customer/{customerId} body', () => {
    const c = CustomerSchema.parse(transformCustomer(CUSTOMER_RECORD))
    expect(c.id).toBe(String(CUSTOMER_RECORD.customerId))
  })

  it('throws without a customerId', () => {
    expect(() =>
      transformCustomer({ ...CUSTOMERS_LIST.Records[0], customerId: undefined }),
    ).toThrow(/customerId/)
  })
})
