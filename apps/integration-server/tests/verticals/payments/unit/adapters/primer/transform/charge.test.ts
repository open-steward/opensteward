import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPrimerPayment,
} from '../../../../../../../src/verticals/payments/adapters/primer/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('primer transformCharge', () => {
  it('maps status "SETTLED" to "succeeded" with captured=true', () => {
    const raw: RawPrimerPayment = {
      id: 'pay_settled',
      status: 'SETTLED',
      amount: 1500,
      currencyCode: 'USD',
      customerId: 'cus_primer',
      customer: { emailAddress: 'buyer@example.com' },
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.id).toBe('pay_settled')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('cus_primer')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('primer')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "SETTLED" with full refund to "refunded"', () => {
    const raw: RawPrimerPayment = {
      id: 'pay_refunded',
      status: 'SETTLED',
      amount: 1000,
      amountRefunded: 1000,
      currencyCode: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "SETTLED" with partial refund to "partially_refunded"', () => {
    const raw: RawPrimerPayment = {
      id: 'pay_partial',
      status: 'SETTLED',
      amount: 2000,
      amountRefunded: 500,
      currencyCode: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "AUTHORIZED" to "pending" with captured undefined', () => {
    const raw: RawPrimerPayment = {
      id: 'pay_auth',
      status: 'AUTHORIZED',
      amount: 800,
      currencyCode: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBeUndefined()
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "DECLINED" to "failed"', () => {
    const raw: RawPrimerPayment = {
      id: 'pay_declined',
      status: 'DECLINED',
      amount: 300,
      currencyCode: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "CANCELLED" to "cancelled"', () => {
    const raw: RawPrimerPayment = {
      id: 'pay_cancel',
      status: 'CANCELLED',
      amount: 400,
      currencyCode: 'GBP',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('picks paymentMethodId from paymentMethod.analyticsId', () => {
    const raw: RawPrimerPayment = {
      id: 'pay_pmid',
      status: 'SETTLED',
      amount: 100,
      currencyCode: 'USD',
      paymentMethod: { analyticsId: 'pm_analytics_xyz' },
    }
    const result = transformCharge(raw)
    expect(result.paymentMethodId).toBe('pm_analytics_xyz')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
