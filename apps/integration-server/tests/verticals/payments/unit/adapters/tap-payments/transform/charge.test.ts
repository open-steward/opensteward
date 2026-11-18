import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawTapCharge,
} from '../../../../../../../src/verticals/payments/adapters/tap-payments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('tap-payments transformCharge', () => {
  it('maps a CAPTURED charge to status "succeeded" with correct amount', () => {
    const raw: RawTapCharge = {
      id: 'chg_001',
      status: 'CAPTURED',
      amount: 100,
      currency: 'AED',
      customer: { id: 'cus_001', email: 'buyer@example.com' },
      description: 'Test charge',
      transaction: { created: '2024-03-01T00:00:00Z' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('AED')
    expect(result.customerId).toBe('cus_001')
    expect(result.gateway).toBe('tap-payments')
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an INITIATED charge to status "pending"', () => {
    const raw: RawTapCharge = {
      id: 'chg_002',
      status: 'INITIATED',
      amount: 50,
      currency: 'AED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a DECLINED charge to status "failed" and populates failureCode', () => {
    const raw: RawTapCharge = {
      id: 'chg_003',
      status: 'DECLINED',
      amount: 200,
      currency: 'KWD',
      response: { code: '05', message: 'Do not honour' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('05')
    expect(result.failureMessage).toBe('Do not honour')
    expect(result.currency).toBe('KWD')
    // KWD: 3 decimal places → 200 * 1000 = 200000
    expect(result.amount).toBe(200000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED charge to status "cancelled"', () => {
    const raw: RawTapCharge = {
      id: 'chg_004',
      status: 'CANCELLED',
      amount: 30,
      currency: 'AED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('sets capturedAt only when status is CAPTURED', () => {
    const raw: RawTapCharge = {
      id: 'chg_005',
      status: 'CAPTURED',
      amount: 15,
      currency: 'AED',
      transaction: { created: '2024-03-01T00:00:00Z' },
    }
    const result = transformCharge(raw)
    expect(result.capturedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
