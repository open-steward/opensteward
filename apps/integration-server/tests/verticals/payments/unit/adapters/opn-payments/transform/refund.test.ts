import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawOpnRefund,
} from '../../../../../../../src/verticals/payments/adapters/opn-payments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('opn-payments transformRefund', () => {
  it('maps fields to canonical refund', () => {
    const raw: RawOpnRefund = {
      id: 'rfnd_test_123',
      charge: 'chrg_test_456',
      amount: 15000,
      currency: 'thb',
      status: 'successful',
      metadata: { reason: 'customer request' },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('rfnd_test_123')
    expect(result.externalId).toBe('rfnd_test_123')
    expect(result.chargeId).toBe('chrg_test_456')
    expect(result.amount).toBe(15000)
    expect(result.currency).toBe('THB')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('opn-payments')
    expect(result.metadata).toEqual({ reason: 'customer request' })
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" to failed', () => {
    const raw: RawOpnRefund = {
      id: 'rfnd_fail',
      charge: 'chrg_x',
      amount: 5000,
      currency: 'usd',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending for unknown status', () => {
    const raw: RawOpnRefund = {
      id: 'rfnd_unk',
      charge: 'chrg_y',
      amount: 1000,
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to THB when missing', () => {
    const raw: RawOpnRefund = {
      id: 'rfnd_nocur',
      charge: 'chrg_z',
      amount: 2000,
      status: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('THB')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to "extra" for metadata when "metadata" is absent', () => {
    const raw: RawOpnRefund = {
      id: 'rfnd_extra',
      charge: 'chrg_a',
      amount: 500,
      status: 'success',
      extra: { note: 'test' },
    }
    const result = transformRefund(raw)
    expect(result.metadata).toEqual({ note: 'test' })
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
