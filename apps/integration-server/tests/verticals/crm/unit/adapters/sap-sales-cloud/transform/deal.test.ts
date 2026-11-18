import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawSapOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/sap-sales-cloud/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawSapOpportunity> = {}): RawSapOpportunity {
  return { id: 'opp-001', ...overrides }
}

describe('sap-sales-cloud transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 'opp-42' })).id).toBe('opp-42')
  })

  it('maps name to title, falling back to empty string', () => {
    expect(transformDeal(makeRaw({ name: 'Big Opportunity' })).title).toBe('Big Opportunity')
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('maps expectedRevenue as major-unit amount with currencyCode', () => {
    const result = transformDeal(makeRaw({ expectedRevenue: 120000, currencyCode: 'EUR' }))
    expect(result.value?.amount).toBe(120000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('defaults currency to USD when currencyCode absent', () => {
    const result = transformDeal(makeRaw({ expectedRevenue: 5000 }))
    expect(result.value?.currency).toBe('USD')
  })

  it('maps string expectedRevenue', () => {
    expect(transformDeal(makeRaw({ expectedRevenue: '75000.50' })).value?.amount).toBe(75000.5)
  })

  it('maps statusCode "1" → open, "3" → won, "4" → lost', () => {
    expect(transformDeal(makeRaw({ statusCode: '1' })).status).toBe('open')
    expect(transformDeal(makeRaw({ statusCode: '3' })).status).toBe('won')
    expect(transformDeal(makeRaw({ statusCode: '4' })).status).toBe('lost')
  })

  it('maps salesPhaseName to stage and salesPhaseCode to stage_id', () => {
    const result = transformDeal(
      makeRaw({ salesPhaseName: 'Negotiation', salesPhaseCode: 'PH-05' }),
    )
    expect(result.stage).toBe('Negotiation')
    expect(result.stage_id).toBe('PH-05')
  })

  it('maps winProbability to probability', () => {
    expect(transformDeal(makeRaw({ winProbability: 75 })).probability).toBe(75)
  })

  it('drops probability outside 0–100 range', () => {
    // Source code: probability set only when >= 0 && <= 100
    expect(transformDeal(makeRaw({ winProbability: 150 })).probability).toBeUndefined()
    expect(transformDeal(makeRaw({ winProbability: -1 })).probability).toBeUndefined()
  })

  it('maps accountId to company_id', () => {
    expect(transformDeal(makeRaw({ accountId: 'acc-5' })).company_id).toBe('acc-5')
  })

  it('maps primaryContactId to contact_ids array', () => {
    expect(transformDeal(makeRaw({ primaryContactId: 'cont-3' })).contact_ids).toEqual(['cont-3'])
  })

  it('maps ownerId to owner_id', () => {
    expect(transformDeal(makeRaw({ ownerId: 'usr-2' })).owner_id).toBe('usr-2')
  })

  it('coerces closingDate through toIsoDatetime', () => {
    const result = transformDeal(makeRaw({ closingDate: '2025-12-31T00:00:00.000Z' }))
    expect(result.close_date).toBe('2025-12-31T00:00:00.000Z')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ name: 'Deal' })
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSapOpportunity = {
      id: 'opp-99',
      name: 'Enterprise Contract',
      expectedRevenue: 250000,
      currencyCode: 'USD',
      salesPhaseCode: 'PH-04',
      salesPhaseName: 'Proposal',
      closingDate: '2025-06-30T00:00:00.000Z',
      winProbability: 60,
      accountId: 'acc-1',
      primaryContactId: 'cont-1',
      ownerId: 'usr-1',
      statusCode: '1',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastModifiedAt: '2024-06-01T00:00:00.000Z',
    }
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('sap-sales-cloud untransformDeal', () => {
  it('maps title to name', () => {
    expect(untransformDeal({ title: 'My Deal' })).toMatchObject({ name: 'My Deal' })
  })

  it('maps value.amount to expectedRevenue (major units, no conversion)', () => {
    // SAP deal is already in major units — no conversion
    expect(untransformDeal({ value: { amount: 120000, currency: 'USD' } })).toMatchObject({
      expectedRevenue: 120000,
    })
  })

  it('maps stage_id to salesPhaseCode', () => {
    expect(untransformDeal({ stage_id: 'PH-03' })).toMatchObject({ salesPhaseCode: 'PH-03' })
  })

  it('maps probability to winProbability', () => {
    expect(untransformDeal({ probability: 80 })).toMatchObject({ winProbability: 80 })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformDeal({}))).toHaveLength(0)
  })
})
