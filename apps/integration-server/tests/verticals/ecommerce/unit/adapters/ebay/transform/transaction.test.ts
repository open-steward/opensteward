import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawEbayTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeSaleTransaction(
  overrides: Partial<RawEbayTransaction> = {},
): RawEbayTransaction {
  return {
    transactionId: 'TXN-001',
    orderId: '04-12345-67890',
    transactionType: 'SALE',
    transactionStatus: 'PAYOUT',
    amount: { value: '49.27', currency: 'USD' },
    totalFeeBasisAmount: { value: '49.27', currency: 'USD' },
    totalFeeAmount: { value: '-5.42', currency: 'USD' },
    transactionDate: '2024-05-02T08:00:00.000Z',
    buyer: { username: 'buyer123' },
    ...overrides,
  }
}

describe('transformTransaction (eBay)', () => {
  it('maps SALE transaction to a SALE kind with correct amount', () => {
    const t = transformTransaction(makeSaleTransaction())
    expect(t.id).toBe('TXN-001')
    expect(t.orderId).toBe('04-12345-67890')
    expect(t.kind).toBe('SALE')
    expect(t.status).toBe('SUCCESS')
    expect(t.amount).toEqual({ amount: 4927, currency: 'USD' })
    expect(t.gateway).toBe('ebay')
  })

  it('maps REFUND transaction type correctly', () => {
    const t = transformTransaction(
      makeSaleTransaction({
        transactionId: 'TXN-002',
        transactionType: 'REFUND',
        amount: { value: '-24.99', currency: 'USD' },
      }),
    )
    expect(t.kind).toBe('REFUND')
    expect(t.amount).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('maps DISPUTE transaction type to REFUND kind', () => {
    const t = transformTransaction(
      makeSaleTransaction({
        transactionType: 'DISPUTE',
      }),
    )
    expect(t.kind).toBe('REFUND')
  })

  it('maps transaction status correctly', () => {
    expect(
      transformTransaction(makeSaleTransaction({ transactionStatus: 'PAYOUT' })).status,
    ).toBe('SUCCESS')
    expect(
      transformTransaction(makeSaleTransaction({ transactionStatus: 'FUNDS_PROCESSING' })).status,
    ).toBe('PENDING')
    expect(
      transformTransaction(makeSaleTransaction({ transactionStatus: 'FAILED' })).status,
    ).toBe('FAILURE')
  })

  it('produces a payload that satisfies TransactionSchema and preserves raw in metadata', () => {
    const raw = makeSaleTransaction()
    const t = transformTransaction(raw)
    expect(() => TransactionSchema.parse(t)).not.toThrow()
    expect(t.metadata).toBe(raw)
  })
})
