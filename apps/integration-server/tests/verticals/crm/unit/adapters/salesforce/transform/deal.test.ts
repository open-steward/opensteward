import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawSalesforceOpportunity } from '../../../../../../../src/verticals/crm/adapters/salesforce/transform/deal'

function makeRaw(overrides: Partial<RawSalesforceOpportunity> = {}): RawSalesforceOpportunity {
  return { Id: 'OPP001', Name: 'Big Deal', ...overrides }
}

describe('salesforce transformDeal', () => {
  it('maps Id to id', () => {
    expect(transformDeal(makeRaw()).id).toBe('OPP001')
  })

  it('maps Name to title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps Amount to value.amount', () => {
    const result = transformDeal(makeRaw({ Amount: 5000 }))
    expect(result.value?.amount).toBe(5000)
    expect(result.value?.currency).toBe('USD')
  })

  it('omits value when Amount is null', () => {
    expect(transformDeal(makeRaw({ Amount: null })).value).toBeUndefined()
  })

  it('maps StageName to stage_id', () => {
    expect(transformDeal(makeRaw({ StageName: 'Prospecting' })).stage_id).toBe('Prospecting')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('salesforce untransformDeal', () => {
  it('maps title and amount back to Salesforce fields', () => {
    const result = untransformDeal({ title: 'New Deal', value: { amount: 1000, currency: 'USD' } })
    expect(result.Name).toBe('New Deal')
    expect(result.Amount).toBe(1000)
  })
})
