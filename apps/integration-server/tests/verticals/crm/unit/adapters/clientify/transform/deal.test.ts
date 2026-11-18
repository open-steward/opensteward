/**
 * Fixtures from https://developer.clientify.com/ (the Postman collection):
 * LIST is the first result of "List Deals", DETAIL is the "Deal Details"
 * example, and FULL is the deal record "Add Products to Deal" returns, the
 * only documented shape that carries `currency` and `modified`. Trimmed to
 * the fields the transform reads, values verbatim.
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawClientifyDeal,
} from '../../../../../../../src/verticals/crm/adapters/clientify/transform/deal'

const LIST: RawClientifyDeal = {
  url: 'https://api.clientify.net/v1/deals/596/',
  id: 596,
  owner: 'Felipe Marin',
  name: 'Staging deal from Postman',
  amount: '766786.00',
  contact: 'https://api.clientify.net/v1/contacts/65542/',
  created: '2019-02-28T17:06:53.923123+01:00',
  expected_closed_date: '2019-03-07',
  company: 'https://api.clientify.net/v1/companies/37381/',
  status: 1,
  status_desc: 'Open',
  probability: 1,
  probability_desc: '10%',
  tags: [],
}

const DETAIL: RawClientifyDeal = {
  url: 'https://api.clientify.net/v1/deals/132468/',
  id: 132468,
  owner: 'macri@gmail.com',
  owner_name: 'Clara Cortes',
  name: 'Deal1',
  amount: '5000.00',
  contact: null,
  created: '2020-03-25T18:28:23.430637+01:00',
  expected_closed_date: '2020-03-25',
  company: null,
  source: null,
  status: 2,
  status_desc: 'Expired',
  probability: 8,
  probability_desc: '80%',
  who_can_view: 1,
  pipeline_stage: 'https://api.clientify.net/v1/deals/pipelines/stages/7858/',
  pipeline_stage_desc: 'dsadasdasdasd',
  pipeline: 'https://api.clientify.net/v1/deals/pipelines/1145/',
  pipeline_desc: 'Nuevo Pipeline',
}

const FULL: RawClientifyDeal = {
  url: 'https://api.clientify.net/v1/deals/3397024/',
  id: 3397024,
  owner: 'mvizcainoortiz@gmail.com',
  owner_name: 'Maria Vizcaino Ortiz',
  name: 'Ezquiel Gonzalez',
  amount: '1958.14',
  amount_user: '2000.00',
  currency: 'EUR',
  contact: 'https://api.clientify.net/v1/contacts/20815489/',
  created: '2022-10-17T17:36:09.323030+02:00',
  modified: '2022-10-18T12:48:31.035118+02:00',
  expected_closed_date: '2022-10-24',
  company: null,
  status: 1,
  status_desc: 'Open',
  probability: 2,
}

describe('clientify transformDeal', () => {
  it('maps the documented list row and parses as a canonical Deal', () => {
    const out = DealSchema.parse(transformDeal(LIST))
    expect(out).toMatchObject({
      id: '596',
      title: 'Staging deal from Postman',
      status: 'open',
      contact_ids: ['65542'],
      company_id: '37381',
      close_date: '2019-03-07T00:00:00Z',
      probability: 10,
      created_at: '2019-02-28T17:06:53.923123+01:00',
    })
  })

  it('leaves value out when the record documents no currency', () => {
    expect(transformDeal(LIST).value).toBeUndefined()
    expect(transformDeal(DETAIL).value).toBeUndefined()
  })

  it('maps amount with the record currency when both are present', () => {
    const out = DealSchema.parse(transformDeal(FULL))
    expect(out.value).toEqual({ amount: 1958.14, currency: 'EUR' })
    expect(out.updated_at).toBe('2022-10-18T12:48:31.035118+02:00')
  })

  it('leaves value out for an amount the canonical money cannot hold', () => {
    for (const amount of ['-5.00', '', 'n/a']) {
      const out = DealSchema.parse(transformDeal({ ...FULL, amount }))
      expect(out.value).toBeUndefined()
    }
    expect(transformDeal({ ...FULL, currency: 'euro' }).value).toBeUndefined()
  })

  it('reads pipeline and stage ids from the documented hyperlinks', () => {
    const out = DealSchema.parse(transformDeal(DETAIL))
    expect(out).toMatchObject({
      id: '132468',
      status: 'expired',
      stage: 'dsadasdasdasd',
      stage_id: '7858',
      pipeline_id: '1145',
      probability: 80,
    })
    expect(out.contact_ids).toBeUndefined()
    expect(out.company_id).toBeUndefined()
  })

  it('maps each documented status_id and nothing else', () => {
    expect([1, 2, 3, 4].map((status) => transformDeal({ ...LIST, status }).status)).toEqual([
      'open',
      'expired',
      'won',
      'lost',
    ])
    expect(transformDeal({ ...LIST, status: 9 }).status).toBeUndefined()
  })

  it('reads probability only from a 0-100 percentage', () => {
    expect(transformDeal({ ...LIST, probability_desc: '80%' }).probability).toBe(80)
    expect(transformDeal({ ...LIST, probability_desc: '150%' }).probability).toBeUndefined()
  })

  it('reads close_date only from a YYYY-MM-DD date', () => {
    expect(
      transformDeal({ ...LIST, expected_closed_date: '07/03/2019' }).close_date,
    ).toBeUndefined()
    expect(
      DealSchema.parse(transformDeal({ ...LIST, expected_closed_date: '07/03/2019' })),
    ).toBeTruthy()
  })

  it('does not treat the owner name or e-mail as an owner id', () => {
    expect(transformDeal(LIST).owner_id).toBeUndefined()
    expect(transformDeal(DETAIL).owner_id).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformDeal(LIST).metadata).toBe(LIST)
  })

  it('untransforms back to platform shape', () => {
    expect(untransformDeal({ title: 'Deal A' }).name).toBe('Deal A')
  })
})
