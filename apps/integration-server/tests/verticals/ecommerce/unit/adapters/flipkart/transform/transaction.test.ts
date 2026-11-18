import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawFlipkartTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/flipkart/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeSaleTransaction(
  overrides: Partial<RawFlipkartTransaction> = {},
): RawFlipkartTransaction {
  return {
    order_id: 'OD-FK-1234567890',
    order_item_id: 'OI-FK-001',
    transaction_type: 'SALE',
    amount: 699,
    currency_code: 'INR',
    status: 'COMPLETED',
    settlement_id: 'STL-FK-001',
    settled_at: '2024-06-05T18:00:00Z',
    created_at: '2024-06-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Flipkart)', () => {
  it('maps SALE transaction to a SALE kind with correct id', () => {
    const t = transformTransaction(makeSaleTransaction())
    expect(t.id).toBe('OD-FK-1234567890:OI-FK-001:SALE')
    expect(t.orderId).toBe('OD-FK-1234567890')
    expect(t.kind).toBe('SALE')
    expect(t.status).toBe('SUCCESS')
    expect(t.amount).toEqual({ amount: 699, currency: 'INR' })
    expect(t.gateway).toBe('flipkart')
  })

  it('maps REFUND transaction type to REFUND kind', () => {
    const t = transformTransaction(makeSaleTransaction({
      transaction_type: 'REFUND',
      amount: -699,
    }))
    expect(t.kind).toBe('REFUND')
    expect(t.amount).toEqual({ amount: 699, currency: 'INR' })
  })

  it('maps RETURN transaction type to REFUND kind', () => {
    const t = transformTransaction(makeSaleTransaction({
      transaction_type: 'RETURN_REFUND',
      amount: -500,
    }))
    expect(t.kind).toBe('REFUND')
    expect(t.amount).toEqual({ amount: 500, currency: 'INR' })
  })

  it('maps SETTLEMENT transaction type to SALE kind', () => {
    const t = transformTransaction(makeSaleTransaction({
      transaction_type: 'SETTLEMENT',
    }))
    expect(t.kind).toBe('SALE')
  })

  it('maps unknown transaction type to CAPTURE kind', () => {
    const t = transformTransaction(makeSaleTransaction({
      transaction_type: 'COMMISSION_DEDUCTION',
    }))
    expect(t.kind).toBe('CAPTURE')
  })

  it('maps transaction status correctly', () => {
    expect(transformTransaction(makeSaleTransaction({ status: 'COMPLETED' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeSaleTransaction({ status: 'SETTLED' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeSaleTransaction({ status: 'SUCCESS' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeSaleTransaction({ status: 'PENDING' })).status).toBe('PENDING')
    expect(transformTransaction(makeSaleTransaction({ status: 'FAILED' })).status).toBe('FAILURE')
  })

  it('uses settled_at as processedAt when available', () => {
    const t = transformTransaction(makeSaleTransaction())
    expect(t.processedAt).toBe('2024-06-05T18:00:00Z')
    expect(t.createdAt).toBe('2024-06-01T10:00:00Z')
  })

  it('falls back to created_at for processedAt when settled_at is absent', () => {
    const t = transformTransaction(makeSaleTransaction({ settled_at: undefined }))
    expect(t.processedAt).toBe('2024-06-01T10:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeSaleTransaction()
    const t = transformTransaction(raw)
    expect(t.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const t = transformTransaction(makeSaleTransaction())
    expect(() => TransactionSchema.parse(t)).not.toThrow()
  })

  it('handles negative amounts by taking absolute value', () => {
    const t = transformTransaction(makeSaleTransaction({ amount: -350 }))
    expect(t.amount?.amount).toBe(350)
  })
})
