import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawVippsPayment,
} from '../../../../../../../src/verticals/payments/adapters/vipps-mobilepay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('vipps-mobilepay transformCharge', () => {
  it('maps a captured payment to status "succeeded"', () => {
    const raw: RawVippsPayment = {
      reference: 'REF-001',
      pspReference: 'PSP-001',
      state: 'AUTHORIZED',
      amount: { value: 10000, currency: 'NOK' },
      aggregate: {
        authorizedAmount: { value: 10000, currency: 'NOK' },
        capturedAmount: { value: 10000, currency: 'NOK' },
        refundedAmount: { value: 0, currency: 'NOK' },
        cancelledAmount: { value: 0, currency: 'NOK' },
      },
      paymentMethod: { type: 'VIPPS' },
      profile: { sub: 'customer-123' },
      paymentDescription: 'Order #1',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('NOK')
    expect(result.amountCaptured).toBe(10000)
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('customer-123')
    expect(result.description).toBe('Order #1')
    expect(result.gateway).toBe('vipps-mobilepay')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a fully refunded payment to status "refunded"', () => {
    const raw: RawVippsPayment = {
      reference: 'REF-002',
      state: 'AUTHORIZED',
      amount: { value: 5000, currency: 'NOK' },
      aggregate: {
        authorizedAmount: { value: 5000, currency: 'NOK' },
        capturedAmount: { value: 5000, currency: 'NOK' },
        refundedAmount: { value: 5000, currency: 'NOK' },
        cancelledAmount: { value: 0, currency: 'NOK' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.amountRefunded).toBe(5000)
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a partially refunded payment to status "partially_refunded"', () => {
    const raw: RawVippsPayment = {
      reference: 'REF-003',
      state: 'AUTHORIZED',
      amount: { value: 8000, currency: 'NOK' },
      aggregate: {
        authorizedAmount: { value: 8000, currency: 'NOK' },
        capturedAmount: { value: 8000, currency: 'NOK' },
        refundedAmount: { value: 2000, currency: 'NOK' },
        cancelledAmount: { value: 0, currency: 'NOK' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(2000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a TERMINATED payment to status "cancelled"', () => {
    const raw: RawVippsPayment = {
      reference: 'REF-004',
      state: 'TERMINATED',
      amount: { value: 3000, currency: 'NOK' },
      aggregate: {
        authorizedAmount: { value: 0, currency: 'NOK' },
        capturedAmount: { value: 0, currency: 'NOK' },
        refundedAmount: { value: 0, currency: 'NOK' },
        cancelledAmount: { value: 0, currency: 'NOK' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an EXPIRED payment to status "failed"', () => {
    const raw: RawVippsPayment = {
      reference: 'REF-005',
      state: 'EXPIRED',
      amount: { value: 1500, currency: 'EUR' },
      aggregate: {
        authorizedAmount: { value: 0, currency: 'EUR' },
        capturedAmount: { value: 0, currency: 'EUR' },
        refundedAmount: { value: 0, currency: 'EUR' },
        cancelledAmount: { value: 0, currency: 'EUR' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an authorized-only payment to status "pending"', () => {
    const raw: RawVippsPayment = {
      reference: 'REF-006',
      state: 'AUTHORIZED',
      amount: { value: 2500, currency: 'NOK' },
      aggregate: {
        authorizedAmount: { value: 2500, currency: 'NOK' },
        capturedAmount: { value: 0, currency: 'NOK' },
        refundedAmount: { value: 0, currency: 'NOK' },
        cancelledAmount: { value: 0, currency: 'NOK' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to NOK when not provided', () => {
    const raw: RawVippsPayment = {
      reference: 'REF-007',
      state: 'AUTHORIZED',
      aggregate: {
        authorizedAmount: { value: 1000, currency: 'NOK' },
        capturedAmount: { value: 1000, currency: 'NOK' },
        refundedAmount: { value: 0, currency: 'NOK' },
        cancelledAmount: { value: 0, currency: 'NOK' },
      },
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('NOK')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('includes payment method metadata', () => {
    const raw: RawVippsPayment = {
      reference: 'REF-008',
      pspReference: 'PSP-008',
      state: 'AUTHORIZED',
      amount: { value: 4000, currency: 'NOK' },
      aggregate: {
        authorizedAmount: { value: 4000, currency: 'NOK' },
        capturedAmount: { value: 4000, currency: 'NOK' },
        refundedAmount: { value: 0, currency: 'NOK' },
        cancelledAmount: { value: 0, currency: 'NOK' },
      },
      paymentMethod: { type: 'CARD', cardBin: '411111' },
    }
    const result = transformCharge(raw)
    expect(result.metadata?.['paymentMethodType']).toBe('CARD')
    expect(result.metadata?.['cardBin']).toBe('411111')
    expect(result.metadata?.['pspReference']).toBe('PSP-008')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
