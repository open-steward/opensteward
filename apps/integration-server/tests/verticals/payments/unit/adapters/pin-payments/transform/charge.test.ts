import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPinCharge,
} from '../../../../../../../src/verticals/payments/adapters/pin-payments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('pin-payments transformCharge', () => {
  it('maps status_message "successful" to status "succeeded"', () => {
    const raw: RawPinCharge = {
      token: 'ch_abc123',
      amount: 2500,
      currency: 'AUD',
      status_message: 'successful',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.id).toBe('ch_abc123')
    expect(result.externalId).toBe('ch_abc123')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('pin-payments')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status_message "failed" to status "failed"', () => {
    const raw: RawPinCharge = {
      token: 'ch_fail',
      amount: 1000,
      currency: 'AUD',
      status_message: 'failed',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status_message "refunded" to status "refunded"', () => {
    const raw: RawPinCharge = {
      token: 'ch_refund',
      amount: 500,
      currency: 'AUD',
      status_message: 'refunded',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status_message "cancelled" to status "cancelled"', () => {
    const raw: RawPinCharge = {
      token: 'ch_cancel',
      amount: 750,
      currency: 'AUD',
      status_message: 'cancelled',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults missing status_message to "pending"', () => {
    const raw: RawPinCharge = {
      token: 'ch_pending',
      amount: 300,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('AUD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to AUD when absent', () => {
    const raw: RawPinCharge = { token: 'ch_aud', amount: 100 }
    const result = transformCharge(raw)
    expect(result.currency).toBe('AUD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
