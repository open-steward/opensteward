import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal } from '../../../../../../../src/verticals/crm/adapters/upsales/transform/deal'
import { OPPORTUNITY_LIST } from '../fixtures'

describe('upsales transformDeal (documented "Get Opportunity list" sample)', () => {
  it('maps the documented fields, value beside its own currency', () => {
    const raw = OPPORTUNITY_LIST.data[0]!
    const d = DealSchema.parse(transformDeal(raw))
    expect(d.id).toBe('2')
    expect(d.title).toBe('Example')
    expect(d.value).toEqual({ amount: 10000, currency: 'SEK' })
    expect(d.stage_id).toBe('9')
    expect(d.stage).toBe('Prospect 1')
    expect(d.probability).toBe(25)
    expect(d.company_id).toBe('3')
    expect(d.contact_ids).toBeUndefined()
    expect(d.owner_id).toBe('1')
    expect(d.close_date).toBeUndefined()
    expect(d.created_at).toBe('2018-05-22T11:15:30.000Z')
    expect(d.updated_at).toBe('2018-05-22T11:15:30.000Z')
    expect(d.metadata).toEqual(raw)
  })

  it('reads the single contact object', () => {
    const raw = { ...OPPORTUNITY_LIST.data[0]!, contact: { id: 7 } }
    expect(DealSchema.parse(transformDeal(raw)).contact_ids).toEqual(['7'])
  })

  it('omits value without a currency, never defaulting one', () => {
    const raw = { ...OPPORTUNITY_LIST.data[0]!, currency: null }
    expect(DealSchema.parse(transformDeal(raw)).value).toBeUndefined()
  })

  it('omits value when the amount is missing', () => {
    const raw = { ...OPPORTUNITY_LIST.data[0]!, value: null }
    expect(DealSchema.parse(transformDeal(raw)).value).toBeUndefined()
  })

  it('keeps regDate and modDate apart', () => {
    const raw = { ...OPPORTUNITY_LIST.data[0]!, modDate: '2018-06-01T08:00:00.000Z' }
    const d = DealSchema.parse(transformDeal(raw))
    expect(d.created_at).toBe('2018-05-22T11:15:30.000Z')
    expect(d.updated_at).toBe('2018-06-01T08:00:00.000Z')
  })

  it('maps closeDate ("Date when Order became 100% or 0%") to close_date', () => {
    const raw = { ...OPPORTUNITY_LIST.data[0]!, closeDate: '2018-07-01T00:00:00.000Z' }
    expect(DealSchema.parse(transformDeal(raw)).close_date).toBe('2018-07-01T00:00:00.000Z')
  })

  it('throws on an order without its mandatory description rather than an empty title', () => {
    const raw = { ...OPPORTUNITY_LIST.data[0]!, description: null }
    expect(() => transformDeal(raw)).toThrow(/mandatory/)
  })
})
