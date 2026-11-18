import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawEpRefundTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefundTx(overrides: Partial<RawEpRefundTransaction> = {}): RawEpRefundTransaction {
  return {
    id: 'tx-refund-001',
    type: 'transaction',
    transaction_type: 'refund',
    amount: 2500,
    currency: 'USD',
    status: 'complete',
    reference: 'ref-xyz',
    relationships: {
      order: { data: { type: 'order', id: 'ord-001' } },
    },
    timestamps: {
      created_at: '2024-09-01T10:00:00.000Z',
    },
    ...overrides,
  }
}

describe('transformRefund (Elastic Path)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefundTx(), 'ord-001')
    expect(result.id).toBe('tx-refund-001')
    expect(result.orderId).toBe('ord-001')
    expect(result.transactionIds).toEqual(['tx-refund-001'])
    expect(result.createdAt).toBe('2024-09-01T10:00:00.000Z')
  })

  it('passes through integer minor units for amount', () => {
    const result = transformRefund(makeRefundTx())
    expect(result.amount).toEqual({ amount: 2500, currency: 'USD' })
  })

  it('sets processedAt for completed refunds', () => {
    const result = transformRefund(makeRefundTx({ status: 'complete' }))
    expect(result.processedAt).toBe('2024-09-01T10:00:00.000Z')
  })

  it('does not set processedAt for pending refunds', () => {
    const result = transformRefund(makeRefundTx({ status: 'pending' }))
    expect(result.processedAt).toBeUndefined()
  })

  it('falls back to relationship orderId when not provided', () => {
    const result = transformRefund(makeRefundTx())
    expect(result.orderId).toBe('ord-001')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeRefundTx()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefundTx(), 'ord-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
