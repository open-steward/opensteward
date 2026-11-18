import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawBiginDeal } from '../../../../../../../src/verticals/crm/adapters/zoho-bigin/transform/deal'

function makeRaw(overrides: Partial<RawBiginDeal> = {}): RawBiginDeal {
  return { id: '1', ...overrides }
}

describe('zoho-bigin transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('1')
  })

  it('maps title from Pipeline_Name', () => {
    expect(transformDeal(makeRaw({ Pipeline_Name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('maps value from Amount', () => {
    const result = transformDeal(makeRaw({ Amount: 500 }))
    expect(result.value?.amount).toBe(500)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps status from Stage', () => {
    expect(transformDeal(makeRaw({ Stage: 'Qualified' })).status).toBe('Qualified')
  })

  it('maps pipeline_id from Pipeline.id', () => {
    expect(transformDeal(makeRaw({ Pipeline: { id: '20', name: 'Sales' } })).pipeline_id).toBe('20')
  })

  it('maps company_id from Account_Name.id', () => {
    expect(transformDeal(makeRaw({ Account_Name: { id: '3', name: 'Acme' } })).company_id).toBe('3')
  })

  it('maps contact_ids from Contact_Name.id', () => {
    const result = transformDeal(makeRaw({ Contact_Name: { id: '5', name: 'John' } }))
    expect(result.contact_ids).toEqual(['5'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Test', status: 'open' })
    expect(result.Pipeline_Name).toBe('Test')
    expect(result.Stage).toBe('open')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
