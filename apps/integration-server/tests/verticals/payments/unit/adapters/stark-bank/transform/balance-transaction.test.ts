import { describe, it, expect } from 'vitest'
import { transformBalanceTransaction } from '../../../../../../../src/verticals/payments/adapters/stark-bank/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'
import { DOC_TRANSACTION } from '../fixtures/docs'

describe('stark-bank transformBalanceTransaction', () => {
  it('maps the documented list example (source "self")', () => {
    const result = BalanceTransactionSchema.parse(transformBalanceTransaction(DOC_TRANSACTION))
    expect(result).toMatchObject({
      id: '5185595898855424',
      externalId: '5185595898855424',
      type: 'other',
      amount: -10000,
      currency: 'BRL',
      fee: 0,
      sourceType: 'self',
      description: 'A Lannister always pays his debts',
      gateway: 'stark-bank',
      metadata: { tags: 'lannister,debts' },
      createdAt: '2020-04-24T17:44:49.249Z',
    })
    expect(result.sourceId).toBeUndefined()
    expect(result.net).toBeUndefined()
  })

  it.each([
    ['transfer/1234567890', 'transfer', 'transfer', '1234567890'],
    ['invoice/6394476721340416', 'charge', 'invoice', '6394476721340416'],
    ['merchant-session/5674419263373312', 'other', 'merchant-session', '5674419263373312'],
  ])('maps source %s', (source, type, sourceType, sourceId) => {
    const result = BalanceTransactionSchema.parse(
      transformBalanceTransaction({ ...DOC_TRANSACTION, source }),
    )
    expect(result).toMatchObject({ type, sourceType, sourceId })
  })

  it('refuses a record without an id or amount', () => {
    expect(() => transformBalanceTransaction({ ...DOC_TRANSACTION, id: undefined })).toThrow(
      /no id/,
    )
    expect(() => transformBalanceTransaction({ ...DOC_TRANSACTION, amount: undefined })).toThrow(
      /no amount/,
    )
  })
})
