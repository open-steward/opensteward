import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('bridge-open-banking transformDispute', () => {
  it('maps a lost dispute with fraudulent reason', () => {
    const raw: RawStripeDispute = {
      id: 'dp-001',
      object: 'dispute',
      amount: 5000,
      currency: 'usd',
      status: 'lost',
      reason: 'fraudulent',
      charge: 'ch-001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp-001')
    expect(result.chargeId).toBe('ch-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('lost')
    expect(result.reason).toBe('fraudulent')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawStripeDispute = {
      id: 'dp-002',
      object: 'dispute',
      amount: 2500,
      currency: 'gbp',
      status: 'won',
      reason: 'duplicate',
      payment_intent: 'pi-001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.reason).toBe('duplicate')
    expect(result.chargeId).toBe('pi-001')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown status to needs_response', () => {
    const raw: RawStripeDispute = {
      id: 'dp-003',
      object: 'dispute',
      amount: 1000,
      currency: 'usd',
      status: 'unknown_status',
      charge: 'ch-003',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
