import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawAllegroPaymentOperation,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePaymentOp(
  overrides: Partial<RawAllegroPaymentOperation> = {},
): RawAllegroPaymentOperation {
  return {
    id: 'txn-001',
    type: 'INCOME',
    group: 'ALLEGRO_PAY',
    payment: { id: 'pay-001' },
    value: { amount: '108.97', currency: 'PLN' },
    occurredAt: '2024-05-01T10:05:00.000Z',
    participant: { id: 'buyer-001', companyName: 'Firma Testowa' },
    ...overrides,
  }
}

describe('transformTransaction (Allegro)', () => {
  it('maps core fields from payment operation', () => {
    const result = transformTransaction(makePaymentOp())
    expect(result.id).toBe('txn-001')
    expect(result.orderId).toBe('pay-001')
    expect(result.gateway).toBe('allegro')
  })

  it('maps INCOME type to SALE kind', () => {
    const result = transformTransaction(makePaymentOp({ type: 'INCOME' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps REFUND type to REFUND kind', () => {
    const result = transformTransaction(makePaymentOp({ type: 'REFUND' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps BLOCKADE type to AUTHORIZATION kind with PENDING status', () => {
    const result = transformTransaction(makePaymentOp({ type: 'BLOCKADE' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('PENDING')
  })

  it('maps RELEASE type to VOID kind', () => {
    const result = transformTransaction(makePaymentOp({ type: 'RELEASE' }))
    expect(result.kind).toBe('VOID')
  })

  it('defaults to CAPTURE kind for unknown types', () => {
    const result = transformTransaction(makePaymentOp({ type: 'UNKNOWN_TYPE' }))
    expect(result.kind).toBe('CAPTURE')
  })

  it('parses money values and takes absolute value', () => {
    const result = transformTransaction(
      makePaymentOp({ value: { amount: '-49.99', currency: 'PLN' } }),
    )
    expect(result.amount).toEqual({ amount: 4999, currency: 'PLN' })
  })

  it('handles missing value gracefully', () => {
    const result = transformTransaction(makePaymentOp({ value: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('uses wallet paymentId as fallback orderId', () => {
    const result = transformTransaction(
      makePaymentOp({
        payment: undefined,
        wallet: { paymentId: 'wallet-pay-001', balance: { amount: '100', currency: 'PLN' } },
      }),
    )
    expect(result.orderId).toBe('wallet-pay-001')
  })

  it('surfaces timestamps', () => {
    const result = transformTransaction(makePaymentOp())
    expect(result.processedAt).toBe('2024-05-01T10:05:00.000Z')
    expect(result.createdAt).toBe('2024-05-01T10:05:00.000Z')
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makePaymentOp())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makePaymentOp()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })
})
