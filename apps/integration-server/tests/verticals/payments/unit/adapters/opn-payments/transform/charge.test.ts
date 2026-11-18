import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawOpnCharge,
} from '../../../../../../../src/verticals/payments/adapters/opn-payments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('opn-payments transformCharge', () => {
  it('maps fields to canonical charge', () => {
    const raw: RawOpnCharge = {
      id: 'chrg_test_123',
      amount: 50000,
      currency: 'thb',
      status: 'successful',
      metadata: { order: 'ord_1' },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('chrg_test_123')
    expect(result.externalId).toBe('chrg_test_123')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('THB')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('opn-payments')
    expect(result.metadata).toEqual({ order: 'ord_1' })
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to THB when missing', () => {
    const raw: RawOpnCharge = {
      id: 'chrg_test_456',
      amount: 10000,
      status: 'failed',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('THB')
    expect(result.status).toBe('failed')
    expect(result.createdAt).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "paid" to succeeded', () => {
    const raw: RawOpnCharge = { id: 'chrg_paid', amount: 1000, currency: 'usd', status: 'paid' }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "refunded" to refunded', () => {
    const raw: RawOpnCharge = { id: 'chrg_ref', amount: 1000, status: 'refunded' }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "cancelled" to cancelled', () => {
    const raw: RawOpnCharge = { id: 'chrg_can', amount: 1000, status: 'voided' }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to "extra" for metadata when "metadata" is absent', () => {
    const raw: RawOpnCharge = {
      id: 'chrg_extra',
      amount: 2000,
      status: 'success',
      extra: { note: 'hi' },
    }
    const result = transformCharge(raw)
    expect(result.metadata).toEqual({ note: 'hi' })
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending for unknown status', () => {
    const raw: RawOpnCharge = { id: 'chrg_unk', amount: 0, status: 'some_new_status' }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
