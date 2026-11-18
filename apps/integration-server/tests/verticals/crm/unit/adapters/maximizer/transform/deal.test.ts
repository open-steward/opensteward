import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/maximizer/transform/deal'
import { documentedDeal } from '../fixtures/documented'

describe('maximizer transformDeal (Octopus Opportunity)', () => {
  it('maps the documented Opportunity fields and parses as a Deal', () => {
    const out = DealSchema.parse(transformDeal(documentedDeal()))
    expect(out).toMatchObject({
      id: 'T3Bwb3J0dW5pdHkJMjUwMTAzMjUxNTUwMzE0NTIwMDExTwkw',
      title: 'Test Objective',
      value: { amount: 1234, currency: 'CAD' },
      status: 'In Progress',
      stage: 'First contact',
      stage_id: 'U2FsZXNQcm9jZXNzU3RhZ2VTZXR1cAkyMjA0MDYyNTEzNTIzMjM3MzAwMDZHCTA=',
      pipeline_id: 'U2FsZXNQcm9jZXNzCURFRkFVTFQJMA==',
      company_id: 'Q29tcGFueQkyMjA1MDUyNTIyMjczODY2NDAwMjlDCTA=',
      created_at: '2015-01-20T20:37:51.000Z',
    })
    expect(out.contact_ids).toBeUndefined()
  })

  it('omits value when ForecastRevenue has no CurrencyCode (never defaults a currency)', () => {
    const raw = { ...documentedDeal(), ForecastRevenue: { Value: 2000 } }
    expect(transformDeal(raw).value).toBeUndefined()
  })

  it('omits value when ForecastRevenue is a bare number with no currency', () => {
    const raw = { ...documentedDeal(), ForecastRevenue: 2000 as unknown as { Value: number } }
    expect(transformDeal(raw).value).toBeUndefined()
  })

  it('links a Contact or Individual AbEntry as a contact, not a company', () => {
    const raw = { ...documentedDeal(), AbEntry: { Key: 'Q29udGFjdA==', Type: 'Contact' } }
    const out = transformDeal(raw)
    expect(out.contact_ids).toEqual(['Q29udGFjdA=='])
    expect(out.company_id).toBeUndefined()
  })

  it('links an Individual AbEntry as a contact, not a company', () => {
    const raw = { ...documentedDeal(), AbEntry: { Key: 'SW5kaXZpZHVhbA==', Type: 'Individual' } }
    const out = transformDeal(raw)
    expect(out.contact_ids).toEqual(['SW5kaXZpZHVhbA=='])
    expect(out.company_id).toBeUndefined()
  })

  it('omits value when ForecastRevenue.Value is negative', () => {
    const raw = { ...documentedDeal(), ForecastRevenue: { Value: -5, CurrencyCode: 'CAD' } }
    expect(transformDeal(raw).value).toBeUndefined()
  })

  it('throws when the mandatory Objective is missing', () => {
    expect(() => transformDeal({ Key: 'k' })).toThrow(/Objective/)
  })

  it('keeps the raw row as metadata', () => {
    const raw = documentedDeal()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransform is unchanged (write path, out of scope)', () => {
    expect(untransformDeal({ title: 'T' })).toEqual({ Subject: 'T' })
  })
})
