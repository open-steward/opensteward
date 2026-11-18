/**
 * Fixture: the documented example of GET /object-query/accounts
 * (https://developer.zuora.com/v1-api-reference/api/object-queries/queryaccounts.md,
 * `_bundle/v1-api-reference/api.yaml` QueryAccountsResponse example), plus the
 * documented `billTo.workEmail` / `billTo.workPhone` fields of the "billto" expansion.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawZuoraAccount,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

const DOC_ACCOUNT: RawZuoraAccount = {
  accountNumber: 'A00000130',
  allowInvoiceEdit: false,
  autoPay: false,
  balance: 7300,
  batch: 'Batch1',
  billCycleDay: 1,
  billToId: '8ad08eb292f6328c019318dcd45521b1',
  createdById: '2c92c0f972a852360172bbe22ac551b6',
  createdDate: '2024-11-10T17:35:45-08:00',
  creditBalance: 0,
  currency: 'USD',
  id: '8ad08eb292f6328c019318dcd43821b0',
  name: 'Bella Lawrence',
  paymentTerm: 'Net 30',
  status: 'Active',
  totalInvoiceBalance: 7300,
  updatedById: '2c92c0f972a852360172bbe22ac551b6',
  updatedDate: '2025-03-21T03:24:15-07:00',
}

describe('zuora transformCustomer (Account)', () => {
  it('maps the documented account example', () => {
    const c = CustomerSchema.parse(transformCustomer(DOC_ACCOUNT))
    expect(c.id).toBe('8ad08eb292f6328c019318dcd43821b0')
    expect(c.externalId).toBe(c.id)
    expect(c.name).toBe('Bella Lawrence')
    expect(c.currency).toBe('USD')
    // balance is a major-unit decimal: 7300 USD is 730000 cents.
    expect(c.balance).toBe(730000)
    expect(c.createdAt).toBe('2024-11-11T01:35:45.000Z')
    expect(c.updatedAt).toBe('2025-03-21T10:24:15.000Z')
    expect(c.gateway).toBe('zuora')
    expect(c.email).toBeUndefined()
  })

  it('reads email and phone from the expanded bill-to contact', () => {
    const c = CustomerSchema.parse(
      transformCustomer({
        ...DOC_ACCOUNT,
        billTo: { workEmail: 'bella@example.com', workPhone: '+14155550123' },
      }),
    )
    expect(c.email).toBe('bella@example.com')
    expect(c.phone).toBe('+14155550123')
  })

  it('carries the account notes as the description', () => {
    const c = CustomerSchema.parse(transformCustomer({ ...DOC_ACCOUNT, notes: 'Key account' }))
    expect(c.description).toBe('Key account')
  })

  it('scales the balance by the currency exponent', () => {
    const c = CustomerSchema.parse(
      transformCustomer({ ...DOC_ACCOUNT, currency: 'JPY', balance: 1000 }),
    )
    expect(c.balance).toBe(1000)
  })

  it('omits a balance whose currency is absent instead of guessing a scale', () => {
    const { currency: _c, ...noCurrency } = DOC_ACCOUNT
    const c = CustomerSchema.parse(transformCustomer(noCurrency as RawZuoraAccount))
    expect(c.currency).toBeUndefined()
    expect(c.balance).toBeUndefined()
  })
})
