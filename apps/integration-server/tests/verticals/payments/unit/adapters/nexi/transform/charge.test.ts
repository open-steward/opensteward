import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawNexiPayment,
} from '../../../../../../../src/verticals/payments/adapters/nexi/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('nexi transformCharge', () => {
  it('maps a fully charged payment to status "succeeded"', () => {
    const raw: RawNexiPayment = {
      paymentId: 'pay-001',
      summary: {
        reservedAmount: 10000,
        chargedAmount: 10000,
        refundedAmount: 0,
        cancelledAmount: 0,
      },
      orderDetails: { amount: 10000, currency: 'EUR', reference: 'ORD-001' },
      consumer: { email: 'buyer@example.com' },
      created: '2024-03-01T00:00:00Z',
      charged: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay-001')
    expect(result.externalId).toBe('pay-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('EUR')
    expect(result.captured).toBe(true)
    expect(result.amountCaptured).toBe(10000)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('nexi')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a partially refunded payment to status "partially_refunded"', () => {
    const raw: RawNexiPayment = {
      paymentId: 'pay-002',
      summary: {
        reservedAmount: 10000,
        chargedAmount: 10000,
        refundedAmount: 5000,
        cancelledAmount: 0,
      },
      orderDetails: { amount: 10000, currency: 'EUR' },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a fully refunded payment to status "refunded"', () => {
    const raw: RawNexiPayment = {
      paymentId: 'pay-003',
      summary: {
        reservedAmount: 8000,
        chargedAmount: 8000,
        refundedAmount: 8000,
        cancelledAmount: 0,
      },
      orderDetails: { amount: 8000, currency: 'DKK' },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.currency).toBe('DKK')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled payment (terminated) to status "cancelled"', () => {
    const raw: RawNexiPayment = {
      paymentId: 'pay-004',
      summary: { reservedAmount: 0, chargedAmount: 0, refundedAmount: 0, cancelledAmount: 5000 },
      orderDetails: { amount: 5000, currency: 'EUR' },
      terminated: '2024-03-01T00:00:00Z',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an authorised (reserved only) payment to status "pending"', () => {
    const raw: RawNexiPayment = {
      paymentId: 'pay-005',
      summary: { reservedAmount: 3000, chargedAmount: 0, refundedAmount: 0, cancelledAmount: 0 },
      orderDetails: { amount: 3000, currency: 'SEK' },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(result.currency).toBe('SEK')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('reads consumer email from privatePerson when top-level email is absent', () => {
    const raw: RawNexiPayment = {
      paymentId: 'pay-006',
      summary: { chargedAmount: 2000 },
      orderDetails: { amount: 2000, currency: 'EUR' },
      consumer: { privatePerson: { email: 'person@example.com' } },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.receiptEmail).toBe('person@example.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
