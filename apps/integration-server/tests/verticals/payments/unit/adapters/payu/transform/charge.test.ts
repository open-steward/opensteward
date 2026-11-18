import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  untransformCharge,
  type RawPayuOrder,
} from '../../../../../../../src/verticals/payments/adapters/payu/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('payu transformCharge', () => {
  it('maps a COMPLETED order to succeeded with upper-cased currency', () => {
    const raw: RawPayuOrder = {
      orderId: 'ord_1',
      extOrderId: 'ext_001',
      status: 'COMPLETED',
      totalAmount: '3200',
      currencyCode: 'pln',
      description: 'Test order',
      orderCreateDate: '2023-11-14T10:00:00+01:00',
      buyer: {
        email: 'buyer@test.com',
        firstName: 'Jan',
        lastName: 'Kowalski',
        phone: '+48123456789',
      },
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('ord_1')
    expect(result.externalId).toBe('ext_001')
    expect(result.amount).toBe(3200)
    expect(result.currency).toBe('PLN')
    expect(result.status).toBe('succeeded')
    expect(result.receiptEmail).toBe('buyer@test.com')
    expect(result.description).toBe('Test order')
    expect(result.gateway).toBe('payu')
    expect(result.metadata.buyerName).toBe('Jan Kowalski')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED order to cancelled', () => {
    const raw: RawPayuOrder = {
      orderId: 'ord_2',
      status: 'CANCELED',
      totalAmount: '1000',
      currencyCode: 'EUR',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('cancelled')
    expect(result.amount).toBe(1000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps REJECTED to failed', () => {
    const raw: RawPayuOrder = {
      orderId: 'ord_3',
      status: 'REJECTED',
      totalAmount: '500',
      currencyCode: 'PLN',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING order to pending status', () => {
    const raw: RawPayuOrder = {
      orderId: 'ord_4',
      status: 'PENDING',
      totalAmount: '2000',
      currencyCode: 'USD',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to PLN when absent', () => {
    const raw: RawPayuOrder = {
      orderId: 'ord_5',
      status: 'COMPLETED',
      totalAmount: '100',
    }
    const result = transformCharge(raw)

    expect(result.currency).toBe('PLN')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

describe('payu untransformCharge', () => {
  it('round-trips: transform → untransform preserves key fields', () => {
    const raw: RawPayuOrder = {
      orderId: 'ord_rt',
      extOrderId: 'ext_rt',
      status: 'COMPLETED',
      totalAmount: '5000',
      currencyCode: 'PLN',
      description: 'Round-trip order',
      buyer: { email: 'rt@test.com' },
    }
    const canonical = transformCharge(raw)
    const back = untransformCharge(canonical, 'pos_123')

    expect(back.merchantPosId).toBe('pos_123')
    expect(back.currencyCode).toBe('PLN')
    expect(back.totalAmount).toBe('5000')
    expect(back.description).toBe('Round-trip order')
    expect((back.buyer as Record<string, unknown> | undefined)?.email).toBe('rt@test.com')
  })
})
