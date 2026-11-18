import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  mapRefundStatus,
  type RawPlaidRefund,
} from '../../../../../../../src/verticals/payments/adapters/plaid/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('plaid transformRefund', () => {
  it('maps status "settled" to "succeeded" and links chargeId via transfer_id', () => {
    const raw: RawPlaidRefund = {
      id: 'refund_settled',
      transfer_id: 'transfer_parent',
      amount: '10.00',
      status: 'settled',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw, 'USD')
    expect(result.status).toBe('succeeded')
    expect(result.id).toBe('refund_settled')
    expect(result.chargeId).toBe('transfer_parent')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('plaid')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "pending" to "pending"', () => {
    const raw: RawPlaidRefund = {
      id: 'refund_pend',
      transfer_id: 'tr_x',
      amount: '5.00',
      status: 'pending',
    }
    const result = transformRefund(raw, 'USD')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" to "failed" with failure reason', () => {
    const raw: RawPlaidRefund = {
      id: 'refund_fail',
      transfer_id: 'tr_fail',
      amount: '3.00',
      status: 'failed',
      failure_reason: { description: 'Returned', ach_return_code: 'R29' },
    }
    const result = transformRefund(raw, 'USD')
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Returned')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "cancelled" to "cancelled"', () => {
    const raw: RawPlaidRefund = {
      id: 'refund_cancel',
      transfer_id: 'tr_c',
      amount: '2.00',
      status: 'cancelled',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "funds_available" to "succeeded" via mapRefundStatus', () => {
    const raw: RawPlaidRefund = { id: 'r_fa', amount: '1.00', status: 'funds_available' }
    expect(mapRefundStatus(raw)).toBe('succeeded')
  })

  it('defaults currency to USD when currencyCode arg is omitted', () => {
    const raw: RawPlaidRefund = {
      id: 'r_usd',
      transfer_id: 'tr_usd',
      amount: '1.00',
      status: 'settled',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
