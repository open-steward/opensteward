import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawUnzerCharge,
} from '../../../../../../../src/verticals/payments/adapters/unzer/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('unzer transformCharge', () => {
  it('maps a COMPLETE payment aggregate (state.name) to "succeeded"', () => {
    const raw: RawUnzerCharge = {
      id: 's-pay-001',
      state: { id: 1, name: 'completed' },
      amount: { total: '100.0000', charged: '100.0000', canceled: '0.0000', remaining: '0.0000' },
      currency: 'EUR',
      orderId: 'ord-001',
      invoiceId: 'inv-001',
      date: '2024-03-01 12:00:00',
      resources: {
        customerId: 'cust-123',
        paymentId: 's-pay-001',
        typeId: 's-crd-abc',
      },
      processing: {
        uniqueId: 'uniq-001',
        shortId: 'short-001',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.amountCaptured).toBe(10000)
    expect(result.amountRefunded).toBe(0)
    expect(result.currency).toBe('EUR')
    expect(result.customerId).toBe('cust-123')
    expect(result.paymentMethodId).toBe('s-crd-abc')
    expect(result.invoiceId).toBe('inv-001')
    expect(result.gateway).toBe('unzer')
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING state to "pending"', () => {
    const raw: RawUnzerCharge = {
      id: 's-pay-002',
      state: { id: 0, name: 'pending' },
      amount: { total: '50.0000', charged: '0.0000', canceled: '0.0000', remaining: '50.0000' },
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED state to "cancelled"', () => {
    const raw: RawUnzerCharge = {
      id: 's-pay-003',
      state: { id: 4, name: 'canceled' },
      amount: { total: '25.0000', charged: '0.0000', canceled: '25.0000', remaining: '0.0000' },
      currency: 'GBP',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.amount).toBe(2500)
    expect(result.amountRefunded).toBe(2500)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps isSuccess flag (no state) to "succeeded"', () => {
    const raw: RawUnzerCharge = {
      id: 's-chg-001',
      isSuccess: true,
      amount: '75.00',
      currency: 'EUR',
      date: '2024-04-15T09:30:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(7500)
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps isError flag (no state) to "failed" with failure message', () => {
    const raw: RawUnzerCharge = {
      id: 's-chg-002',
      isError: true,
      amount: '30.00',
      currency: 'EUR',
      message: { merchant: 'Insufficient funds', customer: 'Payment declined' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps isPending flag (no state) to "pending"', () => {
    const raw: RawUnzerCharge = {
      id: 's-chg-003',
      isPending: true,
      amount: '200.00',
      currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(20000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PARTLY state to "partially_refunded"', () => {
    const raw: RawUnzerCharge = {
      id: 's-pay-004',
      state: { id: 5, name: 'partly' },
      amount: { total: '100.0000', charged: '100.0000', canceled: '40.0000', remaining: '0.0000' },
      currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountCaptured).toBe(10000)
    expect(result.amountRefunded).toBe(4000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('handles zero-decimal currency (JPY) correctly', () => {
    const raw: RawUnzerCharge = {
      id: 's-pay-005',
      state: { id: 1, name: 'completed' },
      amount: { total: '1000', charged: '1000', canceled: '0', remaining: '0' },
      currency: 'JPY',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('JPY')
    expect(result.amount).toBe(1000)
    expect(result.amountCaptured).toBe(1000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when not provided', () => {
    const raw: RawUnzerCharge = {
      id: 's-pay-006',
      state: { id: 1, name: 'completed' },
      amount: { total: '10.00', charged: '10.00', canceled: '0', remaining: '0' },
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to resources.paymentId for id when id is missing', () => {
    const raw: RawUnzerCharge = {
      isSuccess: true,
      amount: '15.00',
      resources: { paymentId: 's-pay-fallback' },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('s-pay-fallback')
    expect(result.externalId).toBe('s-pay-fallback')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
