import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('truelayer transformDispute', () => {
  it('maps a needs_response dispute with fraudulent reason', () => {
    const raw: RawStripeDispute = {
      id: 'dp_tl_001',
      object: 'dispute',
      amount: 8000,
      currency: 'usd',
      status: 'needs_response',
      reason: 'fraudulent',
      charge: 'ch_tl_001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp_tl_001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.chargeId).toBe('ch_tl_001')
    expect(result.amount).toBe(8000)
    expect(result.currency).toBe('USD')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawStripeDispute = {
      id: 'dp_tl_002',
      object: 'dispute',
      amount: 3000,
      currency: 'eur',
      status: 'won',
      reason: 'duplicate',
      charge: 'ch_tl_002',
      created: 1709337600,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
