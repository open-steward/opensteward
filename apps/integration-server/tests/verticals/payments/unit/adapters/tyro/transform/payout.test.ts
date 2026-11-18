import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/tyro/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { DOC_SETTLEMENT, DOC_SPLIT_SETTLEMENT } from '../fixtures/reporting'

const ctx = { currency: 'AUD', mid: '111', settlementDate: '2021-07-01' }

describe('tyro transformPayout (Reporting settlement)', () => {
  it('maps the documented single settlement', () => {
    const p = PayoutSchema.parse(transformPayout(DOC_SETTLEMENT, ctx))
    expect(p.id).toBe('e6da4a8e-70f3-4156-9b81-f027f061d59e')
    expect(p.externalId).toBe(p.id)
    expect(p.amount).toBe(20011)
    expect(p.currency).toBe('AUD')
    expect(p.status).toBe('paid')
    expect(p.updatedAt).toBe('2021-07-01T13:45:15.000Z')
    expect(p.metadata).toEqual({ mid: '111', settlementDate: '2021-07-01' })
    expect(p.arrivalDate).toBeUndefined()
  })

  it('reports unknown when split details disagree on status', () => {
    const p = PayoutSchema.parse(transformPayout(DOC_SPLIT_SETTLEMENT, ctx))
    expect(p.amount).toBe(150032)
    expect(p.status).toBe('unknown')
  })

  it('takes updatedAt from the latest settlementDetails[].lastUpdatedAt', () => {
    const d = DOC_SETTLEMENT.settlementDetails[0]!
    const raw = {
      ...DOC_SETTLEMENT,
      settlementDetails: [
        { ...d, lastUpdatedAt: '2021-07-01T13:45:15.000Z' },
        { ...d, lastUpdatedAt: '2021-07-03T09:00:00.000Z' },
        { ...d, lastUpdatedAt: '2021-07-02T09:00:00.000Z' },
      ],
    }
    expect(PayoutSchema.parse(transformPayout(raw, ctx)).updatedAt).toBe('2021-07-03T09:00:00.000Z')
  })

  it.each([
    ['SENT', 'paid'],
    ['RESUBMISSION_SENT', 'paid'],
    ['PENDING', 'pending'],
    ['ON_HOLD', 'pending'],
    ['RESUBMISSION_INITIATED', 'pending'],
    ['RESUBMISSION_ON_HOLD', 'pending'],
    ['WITHHELD_BY_ACQUIRER', 'failed'],
    ['WITHHELD_BY_BANK', 'failed'],
  ])('maps settlementStatus %s to %s', (from, to) => {
    const raw = {
      ...DOC_SETTLEMENT,
      settlementDetails: [{ ...DOC_SETTLEMENT.settlementDetails[0]!, settlementStatus: from }],
    }
    expect(PayoutSchema.parse(transformPayout(raw, ctx)).status).toBe(to)
  })

  it('throws rather than inventing an id or an amount', () => {
    expect(() => transformPayout({ ...DOC_SETTLEMENT, clearingPaymentId: undefined }, ctx)).toThrow(
      /clearingPaymentId/,
    )
    expect(() => transformPayout({ ...DOC_SETTLEMENT, grossAmount: undefined }, ctx)).toThrow(
      /grossAmount/,
    )
  })
})
