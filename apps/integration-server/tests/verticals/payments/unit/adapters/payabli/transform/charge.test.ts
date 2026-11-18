import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/payabli/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { TRANSACTIONS_LIST, TRANSACTION_DETAILS } from '../fixtures/documented'

describe('payabli transformCharge', () => {
  it('maps the documented transaction list record', () => {
    const c = ChargeSchema.parse(transformCharge(TRANSACTIONS_LIST.Records[0], 'CAD'))
    expect(c.id).toBe('2345667-ddd-fff')
    expect(c.externalId).toBe('2345667-ddd-fff')
    // TotalAmount 110.25 "including service fee or sub-charge"
    expect(c.amount).toBe(11025)
    // the record carries no paymentDetails.currency, so the connection's is used
    expect(c.currency).toBe('CAD')
    expect(c.status).toBe('succeeded')
    expect(c.captured).toBe(true)
    expect(c.customerId).toBe('55')
    expect(c.subscriptionId).toBeUndefined()
    expect(c.description).toBe('Monthly subscription')
    expect(c.createdAt).toBe('2019-08-24T14:15:22.000Z')
  })

  it('prefers the documented paymentDetails.currency on the details record', () => {
    const c = ChargeSchema.parse(transformCharge(TRANSACTION_DETAILS, 'CAD'))
    expect(c.currency).toBe('USD')
  })

  it('maps ScheduleReference ("Reference to the subscription that originated the transaction.") to subscriptionId', () => {
    const c = transformCharge({ ...TRANSACTIONS_LIST.Records[0], ScheduleReference: 580 }, 'USD')
    expect(ChargeSchema.parse(c).subscriptionId).toBe('580')
  })

  it('throws rather than defaulting a currency', () => {
    expect(() => transformCharge(TRANSACTIONS_LIST.Records[0])).toThrow(/currency/)
  })

  it('throws rather than defaulting an amount', () => {
    expect(() =>
      transformCharge({ ...TRANSACTIONS_LIST.Records[0], TotalAmount: undefined }, 'USD'),
    ).toThrow(/TotalAmount/)
  })

  it.each([
    [1, 'succeeded'],
    [11, 'pending'],
    [10, 'pending'],
    [2, 'failed'],
    [3, 'failed'],
    [-1, 'failed'],
    [0, 'failed'],
    [-4, 'failed'],
    [-2, 'failed'],
    [5, 'cancelled'],
    [42, 'unknown'],
  ] as const)('maps TransStatus %s to %s', (TransStatus, status) => {
    const c = transformCharge({ ...TRANSACTIONS_LIST.Records[0], TransStatus }, 'USD')
    expect(ChargeSchema.parse(c).status).toBe(status)
  })
})
