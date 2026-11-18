import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawApptivoOpportunity } from '../../../../../../../src/verticals/crm/adapters/apptivo/transform/deal'

function makeRaw(overrides: Partial<RawApptivoOpportunity> = {}): RawApptivoOpportunity {
  return { opportunityId: '1', ...overrides }
}

describe('apptivo transformDeal', () => {
  it('maps id from opportunityId', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps title from name', () => {
    const result = transformDeal(makeRaw({ name: 'Big Deal' }))
    expect(result.title).toBe('Big Deal')
  })

  it('maps value with amount and currency', () => {
    const result = transformDeal(makeRaw({ dealValue: 9000, currency: 'USD' }))
    expect(result.value).toEqual({ amount: 9000, currency: 'USD' })
  })

  it('maps status', () => {
    const result = transformDeal(makeRaw({ status: 'open' }))
    expect(result.status).toBe('open')
  })

  it('maps stage_id', () => {
    const result = transformDeal(makeRaw({ stageId: 's1' }))
    expect(result.stage_id).toBe('s1')
  })

  it('maps company_id from customerId', () => {
    const result = transformDeal(makeRaw({ customerId: 'c1' }))
    expect(result.company_id).toBe('c1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Deal A', status: 'open' })
    expect(result).toBeDefined()
    expect(result.name).toBe('Deal A')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
