/**
 * Fixture: the documented "Balance Movement" example
 * (https://docs.thunes.com/money-transfer/v2/#balance-movement).
 */
import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawThunesBalanceMovement,
} from '../../../../../../../src/verticals/payments/adapters/thunes/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

const DOC_MOVEMENT: RawThunesBalanceMovement = {
  balance_operation_number: 4376,
  creation_date: '2022-12-01T16:28:03Z',
  movement_type: 'PAYOUT_FEES',
  amount: -1.25,
  currency: 'USD',
  transaction_reference_id: 123,
  operation: 'AUTHORIZE',
  balance: 1162.56,
  pending_balance: -120.39,
}

describe('thunes transformBalanceTransaction', () => {
  it('maps the documented example to a canonical balance transaction', () => {
    const result = BalanceTransactionSchema.parse(transformBalanceTransaction(DOC_MOVEMENT, 1))
    expect(result.id).toBe('1-4376')
    expect(result.externalId).toBe('4376')
    expect(result.type).toBe('fee')
    expect(result.amount).toBe(-125)
    expect(result.currency).toBe('USD')
    expect(result.sourceId).toBe('123')
    expect(result.description).toBe('PAYOUT_FEES')
    expect(result.createdAt).toBe('2022-12-01T16:28:03.000Z')
    expect(result.metadata).toEqual({ balance_id: '1', operation: 'AUTHORIZE' })
    expect(result.net).toBeUndefined()
    expect(result.gateway).toBe('thunes')
  })

  it('scales by the currency exponent, not a fixed 100', () => {
    const result = BalanceTransactionSchema.parse(
      transformBalanceTransaction({ ...DOC_MOVEMENT, amount: -1500, currency: 'JPY' }, 2),
    )
    expect(result.amount).toBe(-1500)
  })

  it.each([
    ['PAYOUT', 'payout'],
    ['PAYOUT_FEES', 'fee'],
    ['MINIMUM_COMMITMENT_FEE', 'fee'],
    ['CO_MARKETING_SUPPORT_FEE', 'fee'],
    ['TRANSFER', 'transfer'],
    ['WITHDRAWAL', 'transfer'],
    ['TRADE_CREDIT', 'transfer'],
    ['TRADE_DEBIT', 'transfer'],
    ['REVERSAL', 'adjustment'],
    ['RETAIL_FEE_SHARING', 'other'],
    ['COMMISSION_ON_SPREAD', 'other'],
    ['RETAIL_RATE_SHARING', 'other'],
    ['SOMETHING_NEW', 'unknown'],
  ])('maps movement_type %s to %s', (movementType, expected) => {
    const result = BalanceTransactionSchema.parse(
      transformBalanceTransaction({ ...DOC_MOVEMENT, movement_type: movementType }, 1),
    )
    expect(result.type).toBe(expected)
  })

  it('throws rather than defaulting a missing currency', () => {
    const { currency: _c, ...rest } = DOC_MOVEMENT
    expect(() => transformBalanceTransaction(rest, 1)).toThrow(/currency/)
  })

  it('throws rather than defaulting a missing amount', () => {
    const { amount: _a, ...rest } = DOC_MOVEMENT
    expect(() => transformBalanceTransaction(rest, 1)).toThrow(/amount/)
  })

  it('throws on a missing balance_operation_number', () => {
    const { balance_operation_number: _n, ...rest } = DOC_MOVEMENT
    expect(() => transformBalanceTransaction(rest, 1)).toThrow(/balance_operation_number/)
  })
})
