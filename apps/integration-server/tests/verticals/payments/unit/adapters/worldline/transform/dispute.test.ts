import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawWorldlineDispute,
} from '../../../../../../../src/verticals/payments/adapters/worldline/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('worldline transformDispute', () => {
  it('maps a CREATED dispute to status "needs_response"', () => {
    const raw: RawWorldlineDispute = {
      id: 'wl-dispute-001',
      paymentId: 'wl-pay-001',
      status: 'CREATED',
      disputeOutput: {
        amountOfMoney: { amount: 5000, currencyCode: 'EUR' },
        creationDetails: { disputeCreationDate: '20240301000000' },
        reference: { merchantReference: 'mref-d1' },
      },
      statusOutput: {
        statusCode: 1,
        statusCategory: 'OPEN',
        statusCodeChangeDateTime: '20240301000000',
      },
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('wl-dispute-001')
    expect(result.chargeId).toBe('wl-pay-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('needs_response')
    expect(result.gateway).toBe('worldline')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps IN_REVIEW status to "under_review"', () => {
    const raw: RawWorldlineDispute = {
      id: 'wl-dispute-002',
      paymentId: 'wl-pay-002',
      status: 'IN_REVIEW',
      disputeOutput: {
        amountOfMoney: { amount: 8000, currencyCode: 'USD' },
      },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(result.currency).toBe('USD')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps WON status to "won"', () => {
    const raw: RawWorldlineDispute = {
      id: 'wl-dispute-003',
      paymentId: 'wl-pay-003',
      status: 'WON',
      disputeOutput: {
        amountOfMoney: { amount: 3000, currencyCode: 'EUR' },
      },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps LOST status to "lost"', () => {
    const raw: RawWorldlineDispute = {
      id: 'wl-dispute-004',
      paymentId: 'wl-pay-004',
      status: 'LOST',
      disputeOutput: {
        amountOfMoney: { amount: 1200, currencyCode: 'GBP' },
      },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status to "warning_closed"', () => {
    const raw: RawWorldlineDispute = {
      id: 'wl-dispute-005',
      paymentId: 'wl-pay-005',
      status: 'CANCELLED',
      disputeOutput: {
        amountOfMoney: { amount: 900, currencyCode: 'EUR' },
      },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('warning_closed')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when currencyCode is absent', () => {
    const raw: RawWorldlineDispute = {
      id: 'wl-dispute-006',
      paymentId: 'wl-pay-006',
      status: 'DRAFT',
      disputeOutput: {
        amountOfMoney: { amount: 500 },
      },
    }
    const result = transformDispute(raw)
    expect(result.currency).toBe('EUR')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
