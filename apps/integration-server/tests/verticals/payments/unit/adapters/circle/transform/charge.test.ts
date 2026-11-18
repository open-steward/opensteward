import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCirclePayment,
} from '../../../../../../../src/verticals/payments/adapters/circle/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('circle transformCharge', () => {
  it('maps a "paid" payment to status "succeeded"', () => {
    const raw: RawCirclePayment = {
      id: 'pay-001',
      type: 'payment',
      status: 'paid',
      amount: { amount: '49.99', currency: 'USD' },
      source: { id: 'src-123', type: 'card' },
      description: 'Order #1',
      createDate: '2024-03-01T00:00:00Z',
      updateDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('src-123')
    expect(result.gateway).toBe('circle')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "confirmed" payment with refunds to status "refunded"', () => {
    const raw: RawCirclePayment = {
      id: 'pay-002',
      type: 'payment',
      status: 'confirmed',
      amount: { amount: '20.00', currency: 'EUR' },
      refunds: [{ id: 'ref-001' }],
      createDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.currency).toBe('EUR')
    expect(result.refundIds).toEqual(['ref-001'])
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" payment to status "pending"', () => {
    const raw: RawCirclePayment = {
      id: 'pay-003',
      type: 'payment',
      status: 'pending',
      amount: { amount: '10.00', currency: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" payment to status "failed"', () => {
    const raw: RawCirclePayment = {
      id: 'pay-004',
      type: 'payment',
      status: 'failed',
      amount: { amount: '100.00', currency: 'USD' },
      errorCode: 'card_declined',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('card_declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('includes receipt email from metadata and captures captureAmount', () => {
    const raw: RawCirclePayment = {
      id: 'pay-005',
      type: 'payment',
      status: 'paid',
      amount: { amount: '50.00', currency: 'USD' },
      captureAmount: { amount: '50.00', currency: 'USD' },
      captured: true,
      metadata: { email: 'buyer@example.com', phoneNumber: '+12345678' },
      createDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.amountCaptured).toBe(5000)
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
