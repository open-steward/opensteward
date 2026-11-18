import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawShopwareTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawShopwareTransaction> = {}): RawShopwareTransaction {
  return {
    id: 'tx-b2b-001',
    orderId: 'order-b2b-001',
    amount: { totalPrice: 4250.00 },
    stateMachineState: { technicalName: 'paid', name: 'Paid' },
    paymentMethod: { name: 'Invoice (Net 30)', id: 'pm-1' },
    createdAt: '2024-05-01T10:00:00+00:00',
    updatedAt: '2024-05-15T10:00:00+00:00',
    ...overrides,
  }
}

describe('transformTransaction (Shopware B2B)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('tx-b2b-001')
    expect(result.orderId).toBe('order-b2b-001')
    expect(result.amount).toEqual({ amount: 4250.00, currency: 'EUR' })
    expect(result.gateway).toBe('Invoice (Net 30)')
    expect(result.kind).toBe('CAPTURE')
    expect(result.status).toBe('SUCCESS')
  })

  it('covers kind mappings', () => {
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

  it('covers status mappings', () => {
    const cases: Array<[string, string]> = [
      ['open', 'PENDING'],
      ['reminded', 'PENDING'],
      ['in_progress', 'PENDING'],
      ['paid', 'SUCCESS'],
      ['authorized', 'SUCCESS'],
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

  it('preserves metadata and validates', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
