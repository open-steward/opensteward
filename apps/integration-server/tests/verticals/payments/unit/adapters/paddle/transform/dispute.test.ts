import { describe, it, expect } from 'vitest'
import { transformDispute } from '../../../../../../../src/verticals/payments/adapters/paddle/transform/dispute'
import type { RawPaddleAdjustment } from '../../../../../../../src/verticals/payments/adapters/paddle/transform/refund'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('paddle transformDispute', () => {
  it('maps a chargeback adjustment (approved) to lost dispute status', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_cb_001',
      action: 'chargeback',
      transaction_id: 'txn_001',
      subscription_id: 'sub_001',
      customer_id: 'ctm_001',
      currency_code: 'usd',
      status: 'approved',
      reason: 'fraudulent transaction',
      totals: {
        total: '5000',
        tax: '500',
        fee: '50',
      },
      created_at: '2024-03-15T08:00:00Z',
      updated_at: '2024-03-15T10:00:00Z',
    }
    const result = transformDispute(raw)

    expect(result.id).toBe('adj_cb_001')
    expect(result.externalId).toBe('adj_cb_001')
    expect(result.chargeId).toBe('txn_001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('lost')
    expect(result.reason).toBe('fraudulent')
    expect(result.gateway).toBe('paddle')
    expect(result.metadata.action).toBe('chargeback')
    expect(result.metadata.adjustment_status).toBe('approved')
    expect(result.metadata.subscription_id).toBe('sub_001')
    expect(result.metadata.customer_id).toBe('ctm_001')
    expect(result.createdAt).toBe('2024-03-15T08:00:00Z')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a chargeback adjustment (reversed) to won status', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_cb_002',
      action: 'chargeback',
      transaction_id: 'txn_002',
      currency_code: 'EUR',
      status: 'reversed',
      totals: { total: '2000' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a chargeback_warning to warning_needs_response', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_cw_001',
      action: 'chargeback_warning',
      transaction_id: 'txn_003',
      currency_code: 'GBP',
      status: 'pending',
      totals: { total: '1500' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('warning_needs_response')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a chargeback_warning (reversed) to warning_closed', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_cw_002',
      action: 'chargeback_warning',
      transaction_id: 'txn_004',
      currency_code: 'USD',
      status: 'reversed',
      totals: { total: '800' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('warning_closed')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a chargeback_reverse action to charge_refunded', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_cr_001',
      action: 'chargeback_reverse',
      transaction_id: 'txn_005',
      currency_code: 'USD',
      status: 'approved',
      totals: { total: '3000' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('charge_refunded')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps reason containing "duplicate" to duplicate', () => {
    const raw: RawPaddleAdjustment = {
      id: 'adj_cb_003',
      action: 'chargeback',
      transaction_id: 'txn_006',
      currency_code: 'USD',
      status: 'pending',
      reason: 'duplicate charge',
      totals: { total: '1000' },
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
