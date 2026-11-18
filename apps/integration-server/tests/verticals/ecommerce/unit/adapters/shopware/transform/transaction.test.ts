import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawShopwareTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(
  overrides: Partial<RawShopwareTransaction> = {},
): RawShopwareTransaction {
  return {
    id: 'tx-abc123',
    orderId: 'order-001',
    amount: { totalPrice: 59.98 },
    stateMachineState: { technicalName: 'paid', name: 'Paid' },
    paymentMethod: { name: 'Invoice', id: 'pm-1', shortName: 'invoice' },
    createdAt: '2024-05-01T10:00:00+00:00',
    updatedAt: '2024-05-01T12:00:00+00:00',
    ...overrides,
  }
}

describe('transformTransaction (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('tx-abc123')
    expect(result.orderId).toBe('order-001')
    expect(result.amount).toEqual({ amount: 5998, currency: 'EUR' })
    expect(result.gateway).toBe('Invoice')
    expect(result.kind).toBe('CAPTURE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps kind from state machine states', () => {
    const cases: Array<[string, string]> = [
      ['authorized', 'AUTHORIZATION'],
      ['paid', 'CAPTURE'],
      ['paid_partially', 'CAPTURE'],
      ['refunded', 'REFUND'],
      ['refunded_partially', 'REFUND'],
      ['cancelled', 'VOID'],
      ['open', 'SALE'],
    ]
    for (const [state, expected] of cases) {
      const r = transformTransaction(
        makeTransaction({ stateMachineState: { technicalName: state } }),
      )
      expect(r.kind).toBe(expected)
    }
  })

  it('maps status from state machine states', () => {
    const cases: Array<[string, string]> = [
      ['open', 'PENDING'],
      ['reminded', 'PENDING'],
      ['in_progress', 'PENDING'],
      ['authorized', 'SUCCESS'],
      ['paid', 'SUCCESS'],
      ['refunded', 'SUCCESS'],
      ['cancelled', 'FAILURE'],
      ['failed', 'ERROR'],
    ]
    for (const [state, expected] of cases) {
      const r = transformTransaction(
        makeTransaction({ stateMachineState: { technicalName: state } }),
      )
      expect(r.status).toBe(expected)
    }
  })

  it('uses provided currency', () => {
    const result = transformTransaction(makeTransaction(), 'USD')
    expect(result.amount?.currency).toBe('USD')
  })

  it('handles missing amount', () => {
    const result = transformTransaction(makeTransaction({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('falls back to shortName for gateway', () => {
    const result = transformTransaction(
      makeTransaction({ paymentMethod: { id: 'pm-1', shortName: 'stripe' } }),
    )
    expect(result.gateway).toBe('stripe')
  })

  it('preserves raw payload in metadata and validates', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
