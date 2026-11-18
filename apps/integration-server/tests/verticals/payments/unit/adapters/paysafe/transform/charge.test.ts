import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPaysafePayment,
} from '../../../../../../../src/verticals/payments/adapters/paysafe/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('paysafe transformCharge', () => {
  it('maps a COMPLETED payment with settlements', () => {
    const raw: RawPaysafePayment = {
      id: 'pay_001',
      merchantRefNum: 'order-abc',
      amount: 15000,
      currencyCode: 'USD',
      status: 'COMPLETED',
      profile: { id: 'prof_001', email: 'buyer@example.com' },
      settlements: [
        { id: 'settle_001', status: 'COMPLETED', amount: 15000, availableToRefund: 15000 },
      ],
      txnTime: '2024-03-01T00:00:00Z',
      updatedTime: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.id).toBe('pay_001')
    expect(result.externalId).toBe('pay_001')
    expect(result.amount).toBe(15000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.amountCaptured).toBe(15000)
    expect(result.customerId).toBe('prof_001')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('paysafe')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED payment with error info', () => {
    const raw: RawPaysafePayment = {
      id: 'pay_002',
      amount: 5000,
      currencyCode: 'USD',
      status: 'FAILED',
      error: { code: 'DECLINED', message: 'Card declined' },
      txnTime: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('DECLINED')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED payment', () => {
    const raw: RawPaysafePayment = {
      id: 'pay_003',
      amount: 3000,
      currencyCode: 'EUR',
      status: 'CANCELLED',
      txnTime: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a HELD payment to "disputed"', () => {
    const raw: RawPaysafePayment = {
      id: 'pay_004',
      amount: 8000,
      currencyCode: 'GBP',
      status: 'HELD',
      txnTime: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
