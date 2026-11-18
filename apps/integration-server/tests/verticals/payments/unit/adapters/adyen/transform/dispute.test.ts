import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawAdyenDispute,
} from '../../../../../../../src/verticals/payments/adapters/adyen/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('adyen transformDispute', () => {
  it('maps an open dispute with fraud reason to canonical', () => {
    const raw: RawAdyenDispute = {
      disputePspReference: 'DISP-001',
      paymentPspReference: 'PSP-001',
      amount: { value: 5000, currency: 'usd' },
      disputeStatus: 'open',
      disputeReason: 'fraud',
      defenseDeadline: '2024-04-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('DISP-001')
    expect(result.chargeId).toBe('PSP-001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.evidenceDueBy).toBe('2024-04-01T00:00:00Z')
    expect(result.gateway).toBe('adyen')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawAdyenDispute = {
      disputePspReference: 'DISP-002',
      paymentPspReference: 'PSP-002',
      amount: { value: 2000, currency: 'eur' },
      disputeStatus: 'won',
      disputeReason: 'duplicate',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps an under_review dispute', () => {
    const raw: RawAdyenDispute = {
      disputePspReference: 'DISP-003',
      paymentPspReference: 'PSP-003',
      amount: { value: 1500, currency: 'gbp' },
      disputeStatus: 'under_review',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(result.reason).toBeUndefined()
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
