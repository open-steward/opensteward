import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('tyro transformDispute', () => {
  it('maps a needs_response dispute', () => {
    const raw: RawStripeDispute = {
      id: 'dp_tyro_001',
      object: 'dispute',
      amount: 10000,
      currency: 'aud',
      status: 'needs_response',
      reason: 'fraudulent',
      charge: 'ch_tyro_001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp_tyro_001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.chargeId).toBe('ch_tyro_001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('AUD')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawStripeDispute = {
      id: 'dp_tyro_002',
      object: 'dispute',
      amount: 5000,
      currency: 'aud',
      status: 'won',
      reason: 'product_not_received',
      charge: 'ch_tyro_002',
      created: 1709337600,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.reason).toBe('product_not_received')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
