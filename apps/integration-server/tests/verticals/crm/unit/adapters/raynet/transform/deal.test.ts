import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/raynet/transform/deal'
import { DEAL, DEAL_DETAIL } from '../fixtures'

describe('raynet transformDeal (GET /businessCase/ documented examples)', () => {
  it('maps the list example and parses as a canonical Deal', () => {
    const d = DealSchema.parse(transformDeal(DEAL))
    expect(d).toMatchObject({
      id: '414',
      title: 'First deal',
      value: { amount: 3797.01, currency: 'CZK' },
      status: 'won',
      stage: 'Win',
      stage_id: '45',
      company_id: '1093',
      owner_id: '11',
      probability: 100,
      // A won deal's close date is its closing date (validTill).
      close_date: '2022-01-21T00:00:00.000Z',
      created_at: '2022-09-18T08:59:00.000Z',
    })
    expect(d.pipeline_id).toBeUndefined()
    expect(d.contact_ids).toBeUndefined()
    expect(d.metadata).toEqual(DEAL)
  })

  it('omits the value when the currency label is not an ISO code (the detail example has "$")', () => {
    const d = DealSchema.parse(transformDeal(DEAL_DETAIL))
    expect(d.value).toBeUndefined()
    expect(d.status).toBe('open')
    expect(d.contact_ids).toEqual(['3'])
    // An open deal's close date is the estimate, which is null here.
    expect(d.close_date).toBeUndefined()
  })

  it('reads an open deal close date from scheduledEnd and the pipeline from businessCaseType', () => {
    const d = DealSchema.parse(
      transformDeal({
        ...DEAL_DETAIL,
        scheduledEnd: '2022-12-01',
        businessCaseType: { id: 3, value: 'Service' },
      }),
    )
    expect(d.close_date).toBe('2022-12-01T00:00:00.000Z')
    expect(d.pipeline_id).toBe('3')
  })

  it('omits the value when the final price is negative', () => {
    const d = DealSchema.parse(transformDeal({ ...DEAL, totalAmount: -1 }))
    expect(d.value).toBeUndefined()
  })

  it('refuses a deal without its required name instead of inventing one', () => {
    expect(() => transformDeal({ ...DEAL, name: null })).toThrow(
      expect.objectContaining({ statusCode: 502 }),
    )
  })

  it('maps the canceled status group', () => {
    expect(transformDeal({ ...DEAL, status: 'G_STORNO' }).status).toBe('canceled')
  })

  it('untransforms back to platform shape', () => {
    expect(untransformDeal({ title: 'New Deal' }).name).toBe('New Deal')
  })
})
