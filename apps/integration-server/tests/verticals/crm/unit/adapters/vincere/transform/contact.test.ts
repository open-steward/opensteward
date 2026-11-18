/**
 * Vincere candidate → Contact, over the response examples in Vincere's
 * first-party spec (https://api.vincere.io/vapi.yaml), parsed with the
 * canonical schema.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCandidateSearchItem,
  transformContact,
  untransformContact,
  type RawVincereCandidate,
  type RawVincereCandidateSearchItem,
} from '../../../../../../../src/verticals/crm/adapters/vincere/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { DOC_CANDIDATE, DOC_CANDIDATE_SEARCH_ITEMS } from '../fixtures/documented'

const searchItems = DOC_CANDIDATE_SEARCH_ITEMS as unknown as RawVincereCandidateSearchItem[]
const detail = DOC_CANDIDATE as unknown as RawVincereCandidate

describe('vincere transformCandidateSearchItem (GET /candidate/search/{matrix_vars})', () => {
  it('parses every documented example item with ContactSchema', () => {
    for (const raw of searchItems) ContactSchema.parse(transformCandidateSearchItem(raw))
  })

  it('maps the documented search fields', () => {
    const c = ContactSchema.parse(transformCandidateSearchItem(searchItems[0]!))
    expect(c).toMatchObject({
      id: '187520',
      first_name: 'Thao',
      last_name: 'Thao',
      name: 'Thao Thao',
      email: 'thuhu1232@nomail.com',
      created_at: '2023-08-22T10:50:31.000Z',
      updated_at: '2023-08-22T10:50:33.322Z',
    })
    expect(c.metadata).toEqual(searchItems[0])
  })

  it('reads mobile, phone, current_job_title and current_employer_obj.id', () => {
    const c = ContactSchema.parse(
      transformCandidateSearchItem({
        ...searchItems[2]!,
        phone: '+44 20 7946 0000',
        current_job_title: 'Engineer',
        current_employer_obj: { id: 32368, name: 'TYSM corp.' },
      }),
    )
    expect(c.mobile).toBe('4214214124124')
    expect(c.phone).toBe('+44 20 7946 0000')
    expect(c.title).toBe('Engineer')
    expect(c.company_id).toBe('32368')
  })

  it('leaves out what the search did not return', () => {
    const c = ContactSchema.parse(transformCandidateSearchItem({ id: 5 }))
    expect(c).toEqual({ id: '5', metadata: { id: 5 } })
  })

  it('throws on an item without an id', () => {
    expect(() =>
      transformCandidateSearchItem({ name: 'x' } as unknown as RawVincereCandidateSearchItem),
    ).toThrow(/without an id/)
  })
})

describe('vincere transformContact (GET /candidate/{id})', () => {
  it('parses the documented example with ContactSchema', () => {
    const c = ContactSchema.parse(transformContact(detail))
    expect(c).toMatchObject({
      id: '9999',
      first_name: 'Tom',
      last_name: 'Hank',
      name: 'Tom Yen Hank',
      email: 'tom.hank@vincere.io',
      phone: '(+84) 93 777 7777',
      mobile: '(+84) 93 777 7777',
      title: 'Developer',
      created_at: '2018-04-05T00:00:00.000Z',
      updated_at: '2018-04-05T00:00:00.000Z',
    })
    expect(c.company_id).toBeUndefined()
  })

  it('reads the { id } a write answers without inventing fields', () => {
    expect(ContactSchema.parse(transformContact({ id: 0 }))).toEqual({
      id: '0',
      metadata: { id: 0 },
    })
  })
})

describe('vincere untransformContact', () => {
  it('omits undefined fields', () => {
    expect(untransformContact({ first_name: 'Jane' })).toEqual({ first_name: 'Jane' })
  })
})
