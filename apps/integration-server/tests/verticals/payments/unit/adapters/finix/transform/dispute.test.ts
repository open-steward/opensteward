import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawFinixDispute,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('finix transformDispute', () => {
  it('maps NEEDS_RESPONSE response_state to "needs_response" regardless of state', () => {
    const raw: RawFinixDispute = {
      id: 'DPi1',
      amount: 3000,
      currency: 'USD',
      state: 'PENDING',
      response_state: 'NEEDS_RESPONSE',
      reason: 'FRAUD',
      transfer: 'TRf1',
      respond_by: '2024-03-15T00:00:00.000Z',
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('DPi1')
    expect(result.status).toBe('needs_response')
    expect(result.amount).toBe(3000)
    expect(result.chargeId).toBe('TRf1')
    expect(result.reason).toBe('fraudulent')
    expect(result.evidenceDueBy).toBeDefined()
    expect(result.gateway).toBe('finix')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps state WON to "won"', () => {
    const raw: RawFinixDispute = {
      id: 'DPi2',
      amount: 1500,
      state: 'WON',
      response_state: null,
      transfer: 'TRf2',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps state LOST to "lost"', () => {
    const raw: RawFinixDispute = {
      id: 'DPi3',
      amount: 2000,
      state: 'LOST',
      transfer: 'TRf3',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps state INQUIRY to "warning_needs_response"', () => {
    const raw: RawFinixDispute = {
      id: 'DPi4',
      amount: 500,
      state: 'INQUIRY',
      transfer: 'TRf4',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('warning_needs_response')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps reason DUPLICATE to "duplicate"', () => {
    const raw: RawFinixDispute = {
      id: 'DPi5',
      amount: 800,
      state: 'PENDING',
      reason: 'DUPLICATE',
      transfer: 'TRf5',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when absent', () => {
    const raw: RawFinixDispute = {
      id: 'DPi6',
      amount: 1000,
      state: 'PENDING',
      currency: null,
      transfer: 'TRf6',
    }
    const result = transformDispute(raw)
    expect(result.currency).toBe('USD')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
