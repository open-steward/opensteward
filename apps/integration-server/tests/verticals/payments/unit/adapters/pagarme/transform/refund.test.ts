import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/refund'
import type { RawPagarmeCharge } from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/charge'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('pagarme transformRefund', () => {
  it('maps a canceled charge to a succeeded refund', () => {
    const charge: RawPagarmeCharge = {
      id: 'ch_cancel',
      amount: 10000,
      currency: 'brl',
      status: 'canceled',
      last_transaction: {
        id: 'tx_rev_01',
        transaction_type: 'credit_card',
        gateway_id: 'gw_99',
      },
      canceled_at: '2024-03-10T00:00:00Z',
      updated_at: '2024-03-10T00:00:00Z',
    }
    const result = transformRefund(charge)
    expect(result.id).toBe('tx_rev_01')
    expect(result.externalId).toBe('tx_rev_01')
    expect(result.chargeId).toBe('ch_cancel')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('BRL')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('pagarme')
    expect(result.metadata['charge_status']).toBe('canceled')
    expect(result.metadata['transaction_type']).toBe('credit_card')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps partial_canceled charge to succeeded refund with requested amount', () => {
    const charge: RawPagarmeCharge = {
      id: 'ch_partial',
      amount: 8000,
      currency: 'brl',
      status: 'partial_canceled',
      canceled_at: '2024-03-11T00:00:00Z',
      updated_at: '2024-03-11T00:00:00Z',
    }
    const result = transformRefund(charge, 3000)
    expect(result.amount).toBe(3000)
    expect(result.status).toBe('succeeded')
    // no last_transaction, falls back to charge id
    expect(result.id).toBe('ch_partial')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps failed charge to failed refund', () => {
    const charge: RawPagarmeCharge = {
      id: 'ch_failref',
      amount: 5000,
      currency: 'brl',
      status: 'failed',
      updated_at: '2024-03-12T00:00:00Z',
    }
    const result = transformRefund(charge)
    expect(result.status).toBe('failed')
    expect(result.amount).toBe(5000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to charge id when no last_transaction', () => {
    const charge: RawPagarmeCharge = {
      id: 'ch_notx',
      amount: 2000,
      currency: 'brl',
      status: 'canceled',
      canceled_at: '2024-03-13T00:00:00Z',
    }
    const result = transformRefund(charge)
    expect(result.id).toBe('ch_notx')
    expect(result.externalId).toBe('ch_notx')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses BRL when currency is absent', () => {
    const charge: RawPagarmeCharge = {
      id: 'ch_nocurr',
      amount: 1000,
      status: 'canceled',
      canceled_at: '2024-03-14T00:00:00Z',
    }
    const result = transformRefund(charge)
    expect(result.currency).toBe('BRL')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
