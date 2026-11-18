import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawEasebuzzRefund,
} from '../../../../../../../src/verticals/payments/adapters/easebuzz/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('easebuzz transformRefund', () => {
  it('maps a succeeded refund with full fields', () => {
    const raw: RawEasebuzzRefund = {
      refund_id: 'ref_001',
      easy_refund_id: 'EREF_001',
      merchant_refund_id: 'MR001',
      easebuzz_id: 'EASY001',
      txnid: 'TXN001',
      refund_amount: '200.00',
      refund_status: 'refunded',
      reason: 'Customer requested refund',
      settled: 'yes',
      addedon: '2024-03-01 05:30:00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('EREF_001')
    expect(result.externalId).toBe('EREF_001')
    expect(result.chargeId).toBe('EASY001')
    expect(result.amount).toBe(20000)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.failureReason).toBe('Customer requested refund')
    expect(result.gateway).toBe('easebuzz')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses chargeId parameter when provided, overriding easebuzz_id', () => {
    const raw: RawEasebuzzRefund = {
      easy_refund_id: 'EREF_002',
      easebuzz_id: 'EASY002',
      refund_amount: '100.00',
      refund_status: 'processed',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformRefund(raw, 'explicit_charge_id')
    expect(result.chargeId).toBe('explicit_charge_id')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "queued"/"pending" statuses to "pending"', () => {
    const rawQueued: RawEasebuzzRefund = {
      refund_id: 'ref_003',
      refund_status: 'queued',
      refund_amount: '50.00',
      easebuzz_id: 'EASY003',
      addedon: '2024-03-01 05:30:00',
    }
    expect(transformRefund(rawQueued).status).toBe('pending')

    const rawPending: RawEasebuzzRefund = {
      refund_id: 'ref_004',
      refund_status: 'pending',
      refund_amount: '50.00',
      easebuzz_id: 'EASY004',
      addedon: '2024-03-01 05:30:00',
    }
    expect(transformRefund(rawPending).status).toBe('pending')
    expect(() => RefundSchema.parse(transformRefund(rawPending))).not.toThrow()
  })

  it('maps "rejected"/"failed" statuses to "failed"', () => {
    const raw: RawEasebuzzRefund = {
      refund_id: 'ref_005',
      refund_status: 'rejected',
      refund_amount: '75.00',
      easebuzz_id: 'EASY005',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to amount field when refund_amount is absent', () => {
    const raw: RawEasebuzzRefund = {
      refund_id: 'ref_006',
      amount: '300.00',
      refund_status: 'success',
      easebuzz_id: 'EASY006',
      txnid: 'TXN006',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(30000)
    expect(result.chargeId).toBe('EASY006')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "cancelled" status to "cancelled"', () => {
    const raw: RawEasebuzzRefund = {
      refund_id: 'ref_007',
      refund_status: 'cancelled',
      refund_amount: '25.00',
      easebuzz_id: 'EASY007',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
