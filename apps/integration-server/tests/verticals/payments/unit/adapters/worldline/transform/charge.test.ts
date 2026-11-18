import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawWorldlinePayment,
} from '../../../../../../../src/verticals/payments/adapters/worldline/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('worldline transformCharge', () => {
  it('maps a CAPTURED payment to status "succeeded"', () => {
    const raw: RawWorldlinePayment = {
      id: 'wl-pay-001',
      status: 'CAPTURED',
      paymentOutput: {
        amountOfMoney: { amount: 12500, currencyCode: 'EUR' },
        references: { merchantReference: 'ord-42', paymentReference: 'ref-99' },
        paymentMethod: 'card',
      },
      statusOutput: {
        statusCode: 9,
        statusCategory: 'COMPLETED',
        isAuthorized: true,
        statusCodeChangeDateTime: '20240301000000',
      },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('wl-pay-001')
    expect(result.amount).toBe(12500)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.gateway).toBe('worldline')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps CHARGEBACKED status to "disputed"', () => {
    const raw: RawWorldlinePayment = {
      id: 'wl-pay-002',
      status: 'CHARGEBACKED',
      paymentOutput: {
        amountOfMoney: { amount: 5000, currencyCode: 'USD' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status to "cancelled"', () => {
    const raw: RawWorldlinePayment = {
      id: 'wl-pay-003',
      status: 'CANCELLED',
      paymentOutput: {
        amountOfMoney: { amount: 3000, currencyCode: 'GBP' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('GBP')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps REJECTED status to "failed"', () => {
    const raw: RawWorldlinePayment = {
      id: 'wl-pay-004',
      status: 'REJECTED',
      paymentOutput: {
        amountOfMoney: { amount: 1000, currencyCode: 'EUR' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING_PAYMENT status to "pending"', () => {
    const raw: RawWorldlinePayment = {
      id: 'wl-pay-005',
      status: 'PENDING_PAYMENT',
      paymentOutput: {
        amountOfMoney: { amount: 8000, currencyCode: 'EUR' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when currencyCode is absent', () => {
    const raw: RawWorldlinePayment = {
      id: 'wl-pay-006',
      status: 'CAPTURED',
      paymentOutput: {
        amountOfMoney: { amount: 200 },
      },
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('packs merchant and payment references into metadata', () => {
    const raw: RawWorldlinePayment = {
      id: 'wl-pay-007',
      status: 'CAPTURED',
      paymentOutput: {
        amountOfMoney: { amount: 500, currencyCode: 'EUR' },
        references: { merchantReference: 'mref-1', paymentReference: 'pref-1' },
      },
    }
    const result = transformCharge(raw)
    expect(result.metadata['merchantReference']).toBe('mref-1')
    expect(result.metadata['paymentReference']).toBe('pref-1')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
