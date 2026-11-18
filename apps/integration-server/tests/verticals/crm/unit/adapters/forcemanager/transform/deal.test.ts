import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/forcemanager/transform/deal'
import { OPPORTUNITIES, OPPORTUNITY } from '../fixtures'

describe('forcemanager transformDeal (documented GET /opportunities/{ID} example)', () => {
  const out = transformDeal(OPPORTUNITY, 'EUR')

  it('parses with the canonical schema, with and without a resolved currency', () => {
    expect(() => DealSchema.parse(out)).not.toThrow()
    expect(() => DealSchema.parse(transformDeal(OPPORTUNITY))).not.toThrow()
    for (const row of OPPORTUNITIES)
      expect(() => DealSchema.parse(transformDeal(row, 'EUR'))).not.toThrow()
  })

  it('maps the documented fields', () => {
    expect(out).toMatchObject({
      id: '127',
      title: '10x packages',
      value: { amount: 34560, currency: 'EUR' },
      stage: 'In progress',
      stage_id: '7',
      company_id: '1757',
      owner_id: '558',
      created_at: '2021-12-16T21:44:46.333Z',
    })
    expect(out.pipeline_id).toBeUndefined()
    // salesProbability's scale is contradictory (0-10 in the POST table, 60 in the PUT example).
    expect(out.probability).toBeUndefined()
    expect(out.close_date).toBeUndefined()
  })

  it('omits the value when the currency is unresolved, never defaulting one', () => {
    expect(transformDeal(OPPORTUNITY).value).toBeUndefined()
  })

  it('omits the value when total is null, never writing 0', () => {
    expect(transformDeal({ ...OPPORTUNITY, total: null }, 'EUR').value).toBeUndefined()
  })

  it('omits a negative total, which the canonical money shape cannot hold', () => {
    const r = transformDeal({ ...OPPORTUNITY, total: -5 }, 'EUR')
    expect(r.value).toBeUndefined()
    expect(() => DealSchema.parse(r)).not.toThrow()
  })

  it('reads the pipeline from type_id and the close date from closedDate', () => {
    const r = transformDeal(OPPORTUNITIES[0]!, 'EUR')
    expect(r.pipeline_id).toBe('61')
    expect(r.close_date).toBe('2017-05-11T13:51:08.000Z')
    expect(r.stage).toBe('Won')
  })

  it('does not derive an open/won/lost status the opportunity does not state', () => {
    expect(out.status).toBeUndefined()
  })

  it('throws on an opportunity with no id', () => {
    expect(() => transformDeal({ ...OPPORTUNITY, id: null })).toThrow(/no id/)
  })

  it('keeps the raw payload as metadata', () => {
    expect(out.metadata).toBe(OPPORTUNITY)
  })

  it('untransform (write path, unchanged) still maps the title', () => {
    expect(untransformDeal({ title: 'Deal A' }).name).toBe('Deal A')
  })
})
