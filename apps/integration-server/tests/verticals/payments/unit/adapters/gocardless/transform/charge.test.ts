import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawGCPayment,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('gocardless transformCharge', () => {
  it('maps a confirmed payment to status "succeeded"', () => {
    const raw: RawGCPayment = {
      id: 'PM001',
      amount: 3000,
      currency: 'gbp',
      status: 'confirmed',
      description: 'Monthly payment',
      reference: 'REF001',
      charge_date: '2024-02-15',
      links: { customer: 'CU001', mandate: 'MD001', subscription: 'SB001' },
      created_at: '2024-01-15T10:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('PM001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(3000)
    expect(result.currency).toBe('GBP')
    expect(result.customerId).toBe('CU001')
    expect(result.paymentMethodId).toBe('MD001')
    expect(result.subscriptionId).toBe('SB001')
    expect(result.description).toBe('Monthly payment')
    expect(result.gateway).toBe('gocardless')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a paid_out payment to status "succeeded"', () => {
    const raw: RawGCPayment = {
      id: 'PM002',
      amount: 1500,
      currency: 'eur',
      status: 'paid_out',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending_submission payment to status "pending"', () => {
    const raw: RawGCPayment = {
      id: 'PM003',
      amount: 500,
      currency: 'gbp',
      status: 'pending_submission',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a failed payment to status "failed"', () => {
    const raw: RawGCPayment = {
      id: 'PM004',
      amount: 750,
      currency: 'gbp',
      status: 'failed',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled payment to status "cancelled"', () => {
    const raw: RawGCPayment = {
      id: 'PM005',
      amount: 800,
      currency: 'gbp',
      status: 'cancelled',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a charged_back payment to status "disputed"', () => {
    const raw: RawGCPayment = {
      id: 'PM006',
      amount: 2000,
      currency: 'gbp',
      status: 'charged_back',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('stores reference and charge_date in metadata', () => {
    const raw: RawGCPayment = {
      id: 'PM007',
      amount: 1200,
      currency: 'gbp',
      status: 'confirmed',
      reference: 'MY-REF',
      charge_date: '2024-03-10',
    }
    const result = transformCharge(raw)
    expect(result.metadata.reference).toBe('MY-REF')
    expect(result.metadata.charge_date).toBe('2024-03-10')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
