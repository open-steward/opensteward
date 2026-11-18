import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawDLocalChargeback,
} from '../../../../../../../src/verticals/payments/adapters/dlocal/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('dlocal transformDispute', () => {
  it('maps a PENDING chargeback to status "needs_response"', () => {
    const raw: RawDLocalChargeback = {
      id: 'chbk-001',
      payment_id: 'pay-001',
      amount: 49.99,
      currency: 'USD',
      status: 'PENDING',
      reason_code: 'FRAUD',
      reason_description: 'Fraudulent transaction',
      chargeback_date: '2024-03-01T00:00:00Z',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('chbk-001')
    expect(result.chargeId).toBe('pay-001')
    expect(result.status).toBe('needs_response')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.reason).toBe('other')
    expect(result.gateway).toBe('dlocal')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a WON chargeback to status "won"', () => {
    const raw: RawDLocalChargeback = {
      id: 'chbk-002',
      payment_id: 'pay-002',
      amount: 100,
      currency: 'BRL',
      status: 'WON',
      chargeback_date: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.currency).toBe('BRL')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a LOST chargeback to status "lost"', () => {
    const raw: RawDLocalChargeback = {
      id: 'chbk-003',
      payment_id: 'pay-003',
      amount: 75,
      currency: 'USD',
      status: 'LOST',
      chargeback_date: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps an UNDER_REVIEW chargeback to status "under_review"', () => {
    const raw: RawDLocalChargeback = {
      id: 'chbk-004',
      payment_id: 'pay-004',
      amount: 200,
      currency: 'USD',
      status: 'UNDER_REVIEW',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
