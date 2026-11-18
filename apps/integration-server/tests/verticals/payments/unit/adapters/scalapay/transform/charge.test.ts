import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawScalapayOrder,
} from '../../../../../../../src/verticals/payments/adapters/scalapay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('scalapay transformCharge', () => {
  it('maps a CHARGED order to succeeded status', () => {
    const raw: RawScalapayOrder = {
      token: 'tok-001',
      status: 'CHARGED',
      totalAmount: { amount: '49.99', currency: 'EUR' },
      consumer: { email: 'buyer@example.com', givenNames: 'Jane', surname: 'Doe' },
      merchantReference: 'order-001',
      createdAt: '2024-03-01T00:00:00Z',
      chargedAt: '2024-03-01T01:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('tok-001')
    expect(result.externalId).toBe('tok-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('EUR')
    expect(result.captured).toBe(true)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('scalapay')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an AUTHORIZED order to pending status', () => {
    const raw: RawScalapayOrder = {
      token: 'tok-002',
      status: 'AUTHORIZED',
      totalAmount: { amount: '20.00', currency: 'EUR' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED order correctly', () => {
    const raw: RawScalapayOrder = {
      token: 'tok-003',
      status: 'CANCELLED',
      totalAmount: { amount: '15.00', currency: 'EUR' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a DECLINED order to failed status', () => {
    const raw: RawScalapayOrder = {
      token: 'tok-004',
      status: 'DECLINED',
      totalAmount: { amount: '30.00', currency: 'EUR' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUNDED order correctly', () => {
    const raw: RawScalapayOrder = {
      token: 'tok-005',
      status: 'REFUNDED',
      totalAmount: { amount: '10.00', currency: 'EUR' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('handles flat amount/currency fields from reporting rows', () => {
    const raw: RawScalapayOrder = {
      token: 'tok-006',
      status: 'CHARGED',
      amount: '99.00',
      currency: 'EUR',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
