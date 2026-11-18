import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawIuguChargeback,
} from '../../../../../../../src/verticals/payments/adapters/iugu/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('iugu transformDispute', () => {
  it('maps a "won" chargeback to status "won"', () => {
    const raw: RawIuguChargeback = {
      id: 'cb-001',
      invoice_id: 'inv-001',
      amount_cents: 10000,
      currency: 'BRL',
      status: 'won',
      payment_method: 'credit_card',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('cb-001')
    expect(result.chargeId).toBe('inv-001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('BRL')
    expect(result.status).toBe('won')
    expect(result.network).toBe('credit_card')
    expect(result.gateway).toBe('iugu')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps Portuguese "ganha" status to "won"', () => {
    const raw: RawIuguChargeback = {
      id: 'cb-002',
      invoice_id: 'inv-002',
      amount_cents: 5000,
      currency: 'BRL',
      status: 'ganha',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps "lost" status to "lost"', () => {
    const raw: RawIuguChargeback = {
      id: 'cb-003',
      charge_id: 'ch-003',
      amount_cents: 2000,
      currency: 'BRL',
      status: 'lost',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(result.chargeId).toBe('ch-003')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps "contested" to "under_review"', () => {
    const raw: RawIuguChargeback = {
      id: 'cb-004',
      invoice_id: 'inv-004',
      amount_cents: 7500,
      currency: 'BRL',
      status: 'contested',
      // iugu returns deadline_date as a full ISO datetime string
      deadline_date: '2024-04-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(result.evidenceDueBy).toBe('2024-04-01T00:00:00Z')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('defaults to "needs_response" for unknown status', () => {
    const raw: RawIuguChargeback = {
      id: 'cb-005',
      invoice_id: 'inv-005',
      total_cents: 3000,
      currency: 'BRL',
      status: 'open',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(result.amount).toBe(3000)
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
