import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawPlanhatDeal,
} from '../../../../../../../src/verticals/crm/adapters/planhat/transform/deal'

// The "Update Opportunity" example response at
// https://www.planhat.com/developers/api/opportunity (values verbatim).
const DOCUMENTED: RawPlanhatDeal = {
  _id: '6101e99b72c0e0884d5e9139',
  status: 'won',
  salesStage: 'Closed won',
  dealDate: '2021-08-03T00:00:00.000Z',
  ownerId: '60ccb1c5965cc9e0f3848075',
  _currency: 'USD',
  companyId: '61006bc89a3e0b702ed8ea49',
  title: 'New opportunity',
  mrr: 250,
  nrr: 500,
  companyName: 'Leo company',
  stageHistory: [],
  landingDate: '2021-07-28T23:34:51.636Z',
  __v: 0,
  closeDate: '2021-07-28T23:36:59.294Z',
}

// The "Get Opportunities List" example: '{ "_id":"5ced0734861084738e27ff21","status":"lost","title":"P1 enabled!" }'
const LISTED: RawPlanhatDeal = {
  _id: '5ced0734861084738e27ff21',
  status: 'lost',
  title: 'P1 enabled!',
}

describe('planhat transformDeal', () => {
  it('parses the documented example with the canonical schema', () => {
    const d = DealSchema.parse(transformDeal(DOCUMENTED))
    expect(d).toMatchObject({
      id: '6101e99b72c0e0884d5e9139',
      title: 'New opportunity',
      status: 'won',
      stage: 'Closed won',
      company_id: '61006bc89a3e0b702ed8ea49',
      owner_id: '60ccb1c5965cc9e0f3848075',
      close_date: '2021-07-28T23:36:59.294Z',
    })
  })

  it('parses the documented list example', () => {
    const d = DealSchema.parse(transformDeal(LISTED))
    expect(d.title).toBe('P1 enabled!')
    expect(d.status).toBe('lost')
  })

  it('maps the documented status "active" to open', () => {
    expect(transformDeal({ ...LISTED, status: 'active' }).status).toBe('open')
  })

  it('never invents a value or a currency from mrr, nrr or _currency', () => {
    expect(transformDeal(DOCUMENTED).value).toBeUndefined()
  })

  it('does not read the undocumented name, value, currency or createdAt', () => {
    const d = transformDeal({
      _id: 'x',
      name: 'n',
      value: 5,
      currency: 'GBP',
      createdAt: '2020-01-01T00:00:00.000Z',
    })
    expect(d.title).toBe('')
    expect(d.value).toBeUndefined()
    expect(d.created_at).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformDeal(DOCUMENTED).metadata).toBe(DOCUMENTED)
  })
})

describe('planhat untransformDeal', () => {
  it('maps close_date to closeDate', () => {
    const result = untransformDeal({ close_date: '2025-12-31' })
    expect(result.closeDate).toBe('2025-12-31')
  })
})
