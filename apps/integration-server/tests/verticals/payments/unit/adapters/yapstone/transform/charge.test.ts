import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawYapstonePayment,
} from '../../../../../../../src/verticals/payments/adapters/yapstone/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('yapstone transformCharge', () => {
  it('maps a successful payment to "succeeded"', () => {
    const raw: RawYapstonePayment = {
      id: 'pay-001',
      amount: 5000,
      currencyCode: 'USD',
      status: 'success',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('yapstone')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined payment to "failed"', () => {
    const raw: RawYapstonePayment = {
      id: 'pay-002',
      amount: 2500,
      currencyCode: 'USD',
      status: 'declined',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a refunded payment', () => {
    const raw: RawYapstonePayment = {
      id: 'pay-003',
      amount: 1000,
      currencyCode: 'EUR',
      status: 'refunded',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a captured/approved payment to "succeeded"', () => {
    const raw: RawYapstonePayment = {
      id: 'pay-004',
      amount: 3000,
      currencyCode: 'GBP',
      status: 'approved',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('GBP')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
