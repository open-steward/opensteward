import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawWorldpayPayment,
} from '../../../../../../../src/verticals/payments/adapters/worldpay-fis/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('worldpay-fis transformCharge', () => {
  it('maps a settled payment to canonical status "succeeded"', () => {
    const raw: RawWorldpayPayment = {
      paymentId: 'pay_001',
      outcome: 'settled',
      value: { amount: 9900, currency: 'USD' },
      description: 'Order #42',
      reference: { transactionReference: 'ref_001' },
      lastEventDateTime: '2026-01-15T09:30:00.000Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay_001')
    expect(result.externalId).toBe('pay_001')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.description).toBe('Order #42')
    expect(result.gateway).toBe('worldpay-fis')
    expect(result.metadata['transactionReference']).toBe('ref_001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a refused payment (via outcome) to canonical status "failed"', () => {
    const raw: RawWorldpayPayment = {
      paymentId: 'pay_002',
      outcome: 'refused',
      value: { amount: 500, currency: 'GBP' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('GBP')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled payment to canonical status "cancelled"', () => {
    const raw: RawWorldpayPayment = {
      paymentId: 'pay_003',
      outcome: 'cancelled',
      value: { amount: 300, currency: 'EUR' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to lastEvent when outcome is absent', () => {
    const raw: RawWorldpayPayment = {
      paymentId: 'pay_004',
      lastEvent: 'authorized',
      value: { amount: 1500, currency: 'USD' },
      lastEventDateTime: '2026-03-10T12:00:00.000Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.createdAt).toBe('2026-03-10T12:00:00.000Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown outcome to "pending"', () => {
    const raw: RawWorldpayPayment = {
      paymentId: 'pay_005',
      outcome: 'something_weird',
      value: { amount: 200, currency: 'CAD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
