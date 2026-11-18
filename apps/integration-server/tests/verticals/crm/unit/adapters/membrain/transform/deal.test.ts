import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/membrain/transform/deal'
import { DOC_OPPORTUNITY } from '../fixtures/docs'

describe('membrain transformDeal', () => {
  it('maps the documented GET /opportunities/{Id} example', () => {
    const out = DealSchema.parse(transformDeal(DOC_OPPORTUNITY))
    expect(out).toMatchObject({
      id: '3456b1a7-c56a-4528-b415-aa19455841d1',
      title: 'AB',
      status: 'Won',
      stage: 'Committment',
      stage_id: '73a3d59c-8b0f-40d3-b115-07c3fdd6814d',
      pipeline_id: '2a1fc16f-25gh-4ad0-97da-cbcf2a582d0c',
      company_id: '6efd2550-81db-4f45-b7a8-2ff8c2cbf93d',
      owner_id: '3357bea5-def8-6907-a18f-c632e7e320a2',
    })
    expect(out.metadata).toEqual(DOC_OPPORTUNITY)
  })

  it('omits the value when ValueCurrencyCode is empty, as in the example', () => {
    expect(transformDeal(DOC_OPPORTUNITY).value).toBeUndefined()
  })

  it('maps ValueInCurrency in its ISO currency', () => {
    const out = DealSchema.parse(
      transformDeal({ ...DOC_OPPORTUNITY, ValueInCurrency: '1234.5', ValueCurrencyCode: 'SEK' }),
    )
    expect(out.value).toEqual({ amount: 1234.5, currency: 'SEK' })
  })

  it('omits the value for a currency code that is not ISO 4217 (docs list "X1K")', () => {
    const out = transformDeal({ ...DOC_OPPORTUNITY, ValueCurrencyCode: 'X1K' })
    expect(out.value).toBeUndefined()
  })

  it.each([
    ['not a number', 'abc'],
    ['negative', '-5'],
  ])('omits a ValueInCurrency that is %s instead of guessing an amount', (_n, ValueInCurrency) => {
    const out = transformDeal({ ...DOC_OPPORTUNITY, ValueInCurrency, ValueCurrencyCode: 'SEK' })
    expect(out.value).toBeUndefined()
  })

  it('refuses a record with no Name instead of inventing one', () => {
    expect(() => transformDeal({ ...DOC_OPPORTUNITY, Name: '' })).toThrow(/no Name/)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Test', status: 'open' })
    expect(result.name).toBe('Test')
    expect(result.status).toBe('open')
  })
})
