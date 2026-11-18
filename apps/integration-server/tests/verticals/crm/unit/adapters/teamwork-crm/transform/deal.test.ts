import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawTeamworkDeal,
} from '../../../../../../../src/verticals/crm/adapters/teamwork-crm/transform/deal'
import { DEAL } from '../fixtures'

describe('teamwork-crm transformDeal', () => {
  it('maps the documented Deal model to a canonical Deal', () => {
    const raw = { ...DEAL } as RawTeamworkDeal
    const deal = DealSchema.parse(transformDeal(raw))
    expect(deal).toMatchObject({
      id: '9001',
      title: 'Acme Q1 Expansion',
      status: 'open',
      stage_id: '72',
      company_id: '55',
      owner_id: '7',
      contact_ids: ['101', '102'],
      close_date: '2020-09-30T00:00:00Z',
      created_at: '2020-03-02T09:15:00Z',
      updated_at: '2020-06-10T16:40:00Z',
    })
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('does not map a value: totalValue has no documented unit and currency is only an id', () => {
    expect(transformDeal({ ...DEAL } as RawTeamworkDeal).value).toBeUndefined()
  })

  it('uses closedAt as the close date of a won or lost deal', () => {
    const won = transformDeal({
      ...DEAL,
      state: 'won',
      closedAt: '2020-07-01T12:00:00Z',
    } as RawTeamworkDeal)
    expect(won.status).toBe('won')
    expect(won.close_date).toBe('2020-07-01T12:00:00Z')
  })

  it('omits contact_ids when the to-many relationship came back short of contactsCount', () => {
    expect(
      transformDeal({ ...DEAL, contactsCount: 3 } as RawTeamworkDeal).contact_ids,
    ).toBeUndefined()
  })

  it('refuses a model without a title', () => {
    expect(() => transformDeal({ ...DEAL, title: null } as unknown as RawTeamworkDeal)).toThrow(
      /no title/,
    )
  })

  it('untransforms back to the write body', () => {
    expect(untransformDeal({ title: 'New Deal' }).name).toBe('New Deal')
  })
})
