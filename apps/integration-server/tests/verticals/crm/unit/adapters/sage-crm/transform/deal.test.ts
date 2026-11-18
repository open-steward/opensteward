import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/sage-crm/transform/deal'
import { opportunity } from '../fixtures/documented'

describe('sage-crm transformDeal (documented Opportunity)', () => {
  it('maps the documented Opportunity fields and parses as a canonical Deal', () => {
    const raw = opportunity(12)
    const out = DealSchema.parse(transformDeal(raw))
    expect(out).toEqual({
      id: '12',
      title: 'Server upgrade 12',
      status: 'In Progress',
      stage: 'Negotiating',
      owner_id: '4',
      company_id: '41',
      contact_ids: ['55'],
      close_date: '2020-03-31T00:00:00.000Z',
      created_at: '2019-08-24T14:15:22.000Z',
      updated_at: '2019-09-01T08:00:00.000Z',
      metadata: raw,
    })
  })

  it('omits value: the currency is a *_CID record id, not an ISO code', () => {
    expect(transformDeal(opportunity(3)).value).toBeUndefined()
  })

  it('throws without the documented required Oppo_Description', () => {
    const { Oppo_Description: _omit, ...raw } = opportunity(3)
    expect(() => transformDeal(raw)).toThrow(/Oppo_Description/)
  })

  it('untransform keeps its previous (write-path) mapping', () => {
    expect(untransformDeal({ title: 'X' })).toEqual({ oppo_description: 'X' })
  })
})
