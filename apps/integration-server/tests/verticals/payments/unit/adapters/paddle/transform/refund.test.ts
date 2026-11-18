import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPaddleAdjustment,
} from '../../../../../../../src/verticals/payments/adapters/paddle/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paddle transformRefund', () => {
  it('maps an approved Paddle adjustment to a succeeded canonical Refund', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_paddle_001',
      action: 'refund',
      transaction_id: 'txn_001',
      subscription_id: 'sub_001',
      customer_id: 'ctm_001',
      currency_code: 'usd',
      status: 'approved',
      reason: 'customer requested refund',
      totals: {
        total: '2500',
        tax: '417',
        subtotal: '2083',
        fee: '50',
      },
      credit_applied_to_balance: '0',
      created_at: '2024-05-10T12:00:00Z',
      updated_at: '2024-05-10T12:05:00Z',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('adj_paddle_001')
    expect(result.externalId).toBe('adj_paddle_001')
    expect(result.chargeId).toBe('txn_001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.gateway).toBe('paddle')
    expect(result.metadata.subscription_id).toBe('sub_001')
    expect(result.metadata.customer_id).toBe('ctm_001')
    expect(result.metadata.action).toBe('refund')
    expect(result.metadata.tax_amount).toBe('417')
    expect(result.createdAt).toBe('2024-05-10T12:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a rejected adjustment to failed status', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_paddle_002',
      action: 'refund',
      transaction_id: 'txn_002',
      currency_code: 'EUR',
      status: 'rejected',
      totals: { total: '1000' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a reversed adjustment to cancelled status', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_paddle_003',
      action: 'refund',
      transaction_id: 'txn_003',
      currency_code: 'GBP',
      status: 'reversed',
      totals: { total: '500' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason "fraud" to fraudulent', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_paddle_004',
      action: 'refund',
      transaction_id: 'txn_004',
      currency_code: 'USD',
      status: 'approved',
      reason: 'fraud detected',
      totals: { total: '3000' },
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to payout_totals.total when totals.total is absent', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_paddle_005',
      action: 'refund',
      transaction_id: 'txn_005',
      currency_code: 'USD',
      status: 'approved',
      payout_totals: { total: '800' },
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(800)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
