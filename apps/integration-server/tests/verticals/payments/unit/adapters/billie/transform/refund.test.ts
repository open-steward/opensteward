import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawBillieCreditNote,
} from '../../../../../../../src/verticals/payments/adapters/billie/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('billie transformRefund', () => {
  it('maps a credit note to a succeeded refund with correct amount', () => {
    const raw: RawBillieCreditNote = {
      uuid: 'credit-note-001',
      external_code: 'CN-EXT-001',
      amount: { gross: 50.0, net: 42.02, tax: 7.98 },
      comment: 'Partial return',
      capture_id: 'invoice-cap-001',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('credit-note-001')
    expect(result.chargeId).toBe('invoice-cap-001')
    // gross 50.0 → 5000 cents
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('billie')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back externalId to uuid when external_code is absent', () => {
    const raw: RawBillieCreditNote = {
      uuid: 'credit-note-002',
      amount: { gross: 20.0, net: 16.81, tax: 3.19 },
      capture_id: 'invoice-cap-002',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('credit-note-002')
    expect(result.externalId).toBe('credit-note-002')
    expect(result.amount).toBe(2000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('carries comment into metadata', () => {
    const raw: RawBillieCreditNote = {
      uuid: 'credit-note-003',
      amount: { gross: 10.0, net: 8.4, tax: 1.6 },
      comment: 'defective item',
      capture_id: 'invoice-cap-003',
    }
    const result = transformRefund(raw)
    expect(result.metadata['comment']).toBe('defective item')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
