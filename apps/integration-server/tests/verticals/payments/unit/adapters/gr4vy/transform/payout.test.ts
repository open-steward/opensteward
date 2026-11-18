import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawGr4vyPayout,
} from '../../../../../../../src/verticals/payments/adapters/gr4vy/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('gr4vy transformPayout', () => {
  it('maps a succeeded payout to status "paid"', () => {
    const raw: RawGr4vyPayout = {
      id: 'payout-001',
      amount: 50000,
      currency: 'USD',
      status: 'succeeded',
      external_identifier: 'ext-payout-001',
      merchant: { name: 'Acme Corp', statement_descriptor: 'ACME PAYOUT' },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('payout-001')
    expect(result.externalId).toBe('ext-payout-001')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('paid')
    expect(result.statementDescriptor).toBe('ACME PAYOUT')
    expect(result.gateway).toBe('gr4vy')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a pending payout', () => {
    const raw: RawGr4vyPayout = {
      id: 'payout-002',
      amount: 25000,
      currency: 'EUR',
      status: 'pending',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a failed payout', () => {
    const raw: RawGr4vyPayout = {
      id: 'payout-003',
      amount: 10000,
      currency: 'GBP',
      status: 'failed',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a declined payout to status "failed"', () => {
    const raw: RawGr4vyPayout = {
      id: 'payout-004',
      amount: 5000,
      currency: 'CAD',
      status: 'declined',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD and falls back id as externalId when external_identifier is absent', () => {
    const raw: RawGr4vyPayout = {
      id: 'payout-005',
      amount: 1000,
      status: 'succeeded',
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('USD')
    expect(result.externalId).toBe('payout-005')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
