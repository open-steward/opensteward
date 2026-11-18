import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawZohoDeal } from '../../../../../../../src/verticals/crm/adapters/zoho-crm/transform/deal'

function makeRaw(overrides: Partial<RawZohoDeal> = {}): RawZohoDeal {
  return { id: 'ZODEAL1', ...overrides }
}

describe('zoho-crm transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw()).id).toBe('ZODEAL1')
  })

  it('maps Deal_Name to title', () => {
    expect(transformDeal(makeRaw({ Deal_Name: 'Zoho Deal' })).title).toBe('Zoho Deal')
  })

  it('maps Amount to value.amount', () => {
    const result = transformDeal(makeRaw({ Amount: '8000' }))
    expect(result.value?.amount).toBe(8000)
  })

  it('maps Stage to stage_id', () => {
    expect(transformDeal(makeRaw({ Stage: 'Qualification' })).stage_id).toBe('Qualification')
  })

  it('maps Account_Name.id to company_id', () => {
    expect(transformDeal(makeRaw({ Account_Name: { id: 'ACC1' } })).company_id).toBe('ACC1')
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

describe('zoho-crm untransformDeal', () => {
  it('maps title to Deal_Name', () => {
    expect(untransformDeal({ title: 'New Deal' }).Deal_Name).toBe('New Deal')
  })

  it('maps stage_id to Stage', () => {
    expect(untransformDeal({ stage_id: 'Closed Won' }).Stage).toBe('Closed Won')
  })
})
