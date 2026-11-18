import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/killbill/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

// Example Response of "Retrieve an Account by its ID", https://killbill.github.io/slate/account.html
const DOC_ACCOUNT = {
  accountId: '36c05a84-563b-4794-8958-772d93e677e1',
  name: 'John Doe',
  firstNameLength: null,
  externalKey: '36c05a84-563b-4794-8958-772d93e677e1',
  email: 'john@laposte.com',
  billCycleDayLocal: 0,
  currency: 'USD',
  parentAccountId: null,
  isPaymentDelegatedToParent: false,
  paymentMethodId: null,
  referenceTime: '2023-03-08T16:31:16.000Z',
  timeZone: 'UTC',
  phone: null,
  auditLogs: [],
}

describe('killbill transformCustomer', () => {
  it('maps the documented account example', () => {
    const c = CustomerSchema.parse(transformCustomer(DOC_ACCOUNT))
    expect(c.id).toBe('36c05a84-563b-4794-8958-772d93e677e1')
    expect(c.name).toBe('John Doe')
    expect(c.email).toBe('john@laposte.com')
    expect(c.currency).toBe('USD')
    expect(c.createdAt).toBe('2023-03-08T16:31:16.000Z')
    expect(c.defaultPaymentMethodId).toBeUndefined()
  })

  it('throws on an account with no accountId', () => {
    expect(() => transformCustomer({ name: 'x' })).toThrow(/accountId/)
  })
})
