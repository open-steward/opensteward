import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawCybersourceDispute,
} from '../../../../../../../src/verticals/payments/adapters/cybersource/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('cybersource transformDispute', () => {
  it('maps an open dispute with fraud reason code to fraudulent', () => {
    const raw: RawCybersourceDispute = {
      id: 'disp_1',
      paymentId: 'pay_abc',
      status: 'open',
      amount: '50.00',
      currency: 'USD',
      reasonCode: '4840',
      reasonDescription: 'Fraud',
      evidenceDueDate: '2023-12-01T00:00:00Z',
      submitTimeUtc: '2023-11-14T10:00:00Z',
    }
    const result = transformDispute(raw)

    expect(result.id).toBe('disp_1')
    expect(result.chargeId).toBe('pay_abc')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.gateway).toBe('cybersource')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawCybersourceDispute = {
      id: 'disp_2',
      paymentId: 'pay_xyz',
      status: 'won',
      amount: '20.00',
      currency: 'EUR',
    }
    const result = transformDispute(raw)

    expect(result.status).toBe('won')
    expect(result.amount).toBe(2000)
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps duplicate reason code 4834', () => {
    const raw: RawCybersourceDispute = {
      id: 'disp_3',
      paymentId: 'pay_dup',
      status: 'needs_response',
      amount: '100.00',
      currency: 'USD',
      reasonCode: '4834',
      reasonDescription: 'Duplicate transaction',
    }
    const result = transformDispute(raw)

    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('falls back to caseNumber as id when id is absent', () => {
    const raw: RawCybersourceDispute = {
      caseNumber: 'CN-999',
      status: 'under_review',
      amount: '30.00',
      currency: 'GBP',
    }
    const result = transformDispute(raw)

    expect(result.id).toBe('CN-999')
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
