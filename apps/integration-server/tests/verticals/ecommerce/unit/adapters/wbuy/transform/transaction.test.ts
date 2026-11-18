import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawWooCommerceTransactionOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransactionOrder(
  overrides: Partial<RawWooCommerceTransactionOrder> = {},
): RawWooCommerceTransactionOrder {
  return {
    id: 1001,
    status: 'completed',
    currency: 'USD',
    total: '59.99',
    payment_method: 'stripe',
    date_paid_gmt: '2024-05-01T10:00:00.000Z',
    date_created_gmt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction (wbuy)', () => {
  it('synthesises a transaction id from the order id', () => {
    const result = transformTransaction(makeTransactionOrder())
    expect(result.id).toBe('txn:1001')
    expect(result.orderId).toBe('1001')
  })

  it('maps amount in minor units, gateway, and timestamps', () => {
    const result = transformTransaction(makeTransactionOrder())
    expect(result.amount).toEqual({ amount: 5999, currency: 'USD' })
    expect(result.gateway).toBe('stripe')
    expect(result.processedAt).toBe('2024-05-01T10:00:00.000Z')
  })

  it('maps completed status → SALE kind and SUCCESS status', () => {
    const result = transformTransaction(makeTransactionOrder({ status: 'completed' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps processing status → SALE kind and SUCCESS status', () => {
    const result = transformTransaction(makeTransactionOrder({ status: 'processing' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps on-hold status → AUTHORIZATION kind and PENDING status', () => {
    const result = transformTransaction(makeTransactionOrder({ status: 'on-hold' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('PENDING')
  })

  it('maps refunded status → REFUND kind and FAILURE status', () => {
    const result = transformTransaction(makeTransactionOrder({ status: 'refunded' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('FAILURE')
  })

  it('maps cancelled status → VOID kind and FAILURE status', () => {
    const result = transformTransaction(makeTransactionOrder({ status: 'cancelled' }))
    expect(result.kind).toBe('VOID')
    expect(result.status).toBe('FAILURE')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeTransactionOrder()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw as unknown as Record<string, unknown>)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
