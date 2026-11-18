import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawSkrillRefund,
} from '../../../../../../../src/verticals/payments/adapters/skrill/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('skrill transformRefund', () => {
  it('maps a successful refund with correct fields', () => {
    const raw: RawSkrillRefund = {
      transaction_id: 'ref-skrill-001',
      mb_transaction_id: 'txn-skrill-001',
      mb_amount: 49.99,
      currency: 'EUR',
      status: 'success',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-skrill-001')
    expect(result.externalId).toBe('ref-skrill-001')
    expect(result.chargeId).toBe('txn-skrill-001')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('skrill')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund to status "failed"', () => {
    const raw: RawSkrillRefund = {
      transaction_id: 'ref-skrill-002',
      mb_transaction_id: 'txn-skrill-002',
      mb_amount: 10.0,
      currency: 'GBP',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('GBP')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR and status to "pending" for unknown values', () => {
    const raw: RawSkrillRefund = {
      transaction_id: 'ref-skrill-003',
      mb_transaction_id: 'txn-skrill-003',
      mb_amount: 5.0,
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
