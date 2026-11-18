import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawOpnDispute,
} from '../../../../../../../src/verticals/payments/adapters/opn-payments/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('opn-payments transformDispute', () => {
  it('maps fields to canonical dispute', () => {
    const raw: RawOpnDispute = {
      id: 'dspt_test_123',
      amount: 30000,
      currency: 'thb',
      status: 'open',
      charge: 'chrg_test_456',
      reason_code: 'fraud',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dspt_test_123')
    expect(result.externalId).toBe('dspt_test_123')
    expect(result.amount).toBe(30000)
    expect(result.currency).toBe('THB')
    expect(result.status).toBe('needs_response')
    expect(result.chargeId).toBe('chrg_test_456')
    expect(result.reason).toBe('fraudulent')
    expect(result.gateway).toBe('opn-payments')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "won" to won', () => {
    const raw: RawOpnDispute = {
      id: 'dspt_won',
      amount: 10000,
      currency: 'thb',
      status: 'won',
      charge: 'chrg_abc',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "lost" to lost', () => {
    const raw: RawOpnDispute = {
      id: 'dspt_lost',
      amount: 10000,
      status: 'lost',
      charge: 'chrg_abc',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "pending" to under_review', () => {
    const raw: RawOpnDispute = {
      id: 'dspt_pending',
      amount: 10000,
      status: 'pending',
      charge: 'chrg_abc',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps reason_code with "duplicate" to duplicate', () => {
    const raw: RawOpnDispute = {
      id: 'dspt_dup',
      amount: 5000,
      status: 'open',
      charge: 'chrg_dup',
      reason_code: 'duplicate_transaction',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('omits reason when reason_code is absent', () => {
    const raw: RawOpnDispute = {
      id: 'dspt_noreason',
      amount: 1000,
      status: 'open',
      charge: 'chrg_x',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBeUndefined()
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to THB when missing', () => {
    const raw: RawOpnDispute = {
      id: 'dspt_nocur',
      amount: 1000,
      status: 'open',
      charge: 'chrg_x',
    }
    const result = transformDispute(raw)
    expect(result.currency).toBe('THB')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
