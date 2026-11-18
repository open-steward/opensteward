import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawNgeniusOrder,
  type RawNgeniusPayment,
} from '../../../../../../../src/verticals/payments/adapters/network-international/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('network-international transformCharge', () => {
  it('maps a CAPTURED payment to status "succeeded" with amount from embedded payment', () => {
    const raw: RawNgeniusOrder = {
      reference: 'ORD-001',
      state: 'CAPTURED',
      amount: { currencyCode: 'AED', value: 5000 },
      emailAddress: 'buyer@example.com',
      createDateTime: '2024-03-01T00:00:00Z',
      _embedded: {
        payment: [
          {
            reference: 'PAY-001',
            orderReference: 'ORD-001',
            state: 'CAPTURED',
            amount: { currencyCode: 'AED', value: 5000 },
            updateDateTime: '2024-03-01T00:00:00Z',
          } as RawNgeniusPayment,
        ],
      },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('ORD-001')
    expect(result.externalId).toBe('ORD-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('AED')
    expect(result.captured).toBe(true)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.paymentMethodId).toBe('PAY-001')
    expect(result.gateway).toBe('network-international')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED payment with auth failure details', () => {
    const raw: RawNgeniusOrder = {
      reference: 'ORD-002',
      state: 'FAILED',
      amount: { currencyCode: 'AED', value: 1000 },
      createDateTime: '2024-03-01T00:00:00Z',
      _embedded: {
        payment: [
          {
            reference: 'PAY-002',
            state: 'FAILED',
            amount: { currencyCode: 'AED', value: 1000 },
            authResponse: {
              success: false,
              message: 'Insufficient funds',
              resultCode: 'INSUF_FUNDS',
            },
          } as RawNgeniusPayment,
        ],
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.captured).toBe(false)
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(result.failureCode).toBe('INSUF_FUNDS')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PARTIALLY_REFUNDED state correctly', () => {
    const raw: RawNgeniusOrder = {
      reference: 'ORD-003',
      state: 'PARTIALLY_REFUNDED',
      amount: { currencyCode: 'USD', value: 3000 },
      createDateTime: '2024-03-01T00:00:00Z',
      _embedded: {
        payment: [
          {
            state: 'PARTIALLY_REFUNDED',
            amount: { currencyCode: 'USD', value: 3000 },
          } as RawNgeniusPayment,
        ],
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to order-level amount and state when no embedded payment exists', () => {
    const raw: RawNgeniusOrder = {
      reference: 'ORD-004',
      state: 'AUTHORISED',
      amount: { currencyCode: 'EUR', value: 2000 },
      createDateTime: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('ORD-004')
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(2000)
    expect(result.currency).toBe('EUR')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to AED when amount object is absent', () => {
    const raw: RawNgeniusOrder = {
      reference: 'ORD-005',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('AED')
    expect(result.amount).toBe(0)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
