import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal } from '../../../../../../../src/verticals/crm/adapters/qontak/transform/deal'
import { dealsList } from '../fixtures'

const doc = dealsList.response[0]

describe('qontak transformDeal (documented GET /qontak/crm/deals example)', () => {
  it('maps the documented fields and satisfies DealSchema', () => {
    const d = DealSchema.parse(transformDeal(doc))
    expect(d.id).toBe('1')
    expect(d.title).toBe('Deal A')
    expect(d.value).toEqual({ amount: 10000000, currency: 'IDR' })
    expect(d.pipeline_id).toBe('1')
    expect(d.stage_id).toBe('1')
    expect(d.stage).toBe('Qualified')
    expect(d.company_id).toBe('1')
    expect(d.contact_ids).toEqual(['1'])
    expect(d.close_date).toBe('2021-08-14T17:00:00.000Z')
    expect(d.created_at).toBe('2021-07-12T17:00:00.000Z')
    expect(d.metadata).toEqual(doc)
  })

  it('omits value when currency is missing — never defaults one', () => {
    expect(transformDeal({ ...doc, currency: null }).value).toBeUndefined()
  })

  it('omits value when currency is not an ISO 4217 code — never passes it through', () => {
    const d = DealSchema.parse(transformDeal({ ...doc, currency: 'Rupiah' }))
    expect(d.value).toBeUndefined()
  })

  it('omits value when size is missing — never writes 0', () => {
    expect(transformDeal({ ...doc, size: null }).value).toBeUndefined()
  })

  it('throws on a record with no name', () => {
    expect(() => transformDeal({ ...doc, name: undefined })).toThrow(/name/)
  })
})
