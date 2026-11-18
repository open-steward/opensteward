import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawRecurlyRefund,
} from '../../../../../../../src/verticals/payments/adapters/recurly/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('recurly transformRefund', () => {
  it('maps a successful refund correctly', () => {
    const raw: RawRecurlyRefund = {
      id: 'ref-001',
      uuid: 'uuid-ref-001',
      type: 'refund',
      status: 'success',
      amount: 25.5,
      currency: 'USD',
      account: { id: 'acc-001' },
      invoice: { id: 'inv-001' },
      original_transaction_id: 'txn-001',
      refunded_at: '2024-03-02T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.externalId).toBe('uuid-ref-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2550)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('txn-001')
    expect(result.gateway).toBe('recurly')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund correctly', () => {
    const raw: RawRecurlyRefund = {
      id: 'ref-002',
      uuid: 'uuid-ref-002',
      type: 'refund',
      status: 'failed',
      amount: 10,
      currency: 'EUR',
      original_transaction_id: 'txn-002',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a voided refund to cancelled status', () => {
    const raw: RawRecurlyRefund = {
      id: 'ref-003',
      uuid: 'uuid-ref-003',
      type: 'refund',
      status: 'voided',
      amount: 15,
      currency: 'GBP',
      original_transaction_id: 'txn-003',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
