/**
 * Planhat end user -> canonical Contact.
 *
 * Fixture: the first record of the "Get endusers List" example response at
 * https://www.planhat.com/developers/api/enduser (GET
 * 'https://api.planhat.com/endusers?limit=2&offset=0'), trimmed to the fields
 * the transform reads plus a few it must pass through in metadata.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawPlanhatContact,
} from '../../../../../../../src/verticals/crm/adapters/planhat/transform/contact'

const DOC_EXAMPLE: RawPlanhatContact = {
  _id: '56bccdf554d64d837d01bf2c',
  companyId: '56bccdf554d64d837d01be59',
  companyName: 't2',
  name: 'John Bakers',
  email: 'antonella.silva_1@att.com',
  lastActive: '2021-07-27T02:50:04.000Z',
  firstName: 'John',
  lastName: 'Bakers',
  tags: ['Main Contact', 'mahamadou', 'userss', 'New Tag'],
  sourceId: '0030O00002jbaN1QAI',
  position: 'Fireman',
  phone: '07606356442',
  createDate: '2016-02-11T18:07:49.000Z',
  updatedAt: '2021-07-12T09:49:56.321Z',
  externalId: 'Anton',
}

function makeRaw(overrides: Partial<RawPlanhatContact> = {}): RawPlanhatContact {
  return { _id: 'planhat-1', ...overrides }
}

describe('planhat transformContact', () => {
  it('maps the documented example end user onto a schema-valid Contact', () => {
    const result = ContactSchema.parse(transformContact(DOC_EXAMPLE))
    expect(result).toMatchObject({
      id: '56bccdf554d64d837d01bf2c',
      first_name: 'John',
      last_name: 'Bakers',
      name: 'John Bakers',
      email: 'antonella.silva_1@att.com',
      phone: '07606356442',
      title: 'Fireman',
      company_id: '56bccdf554d64d837d01be59',
      tags: ['Main Contact', 'mahamadou', 'userss', 'New Tag'],
      created_at: '2016-02-11T18:07:49.000Z',
      updated_at: '2021-07-12T09:49:56.321Z',
    })
  })

  it('reads the documented name, not a join of first and last', () => {
    const result = transformContact(
      makeRaw({ name: 'Sadie Santos', firstName: 'S', lastName: 'X' }),
    )
    expect(result.name).toBe('Sadie Santos')
  })

  it('reads created_at from the documented createDate', () => {
    expect(transformContact(makeRaw({ createDate: '2016-02-11T18:07:49.000Z' })).created_at).toBe(
      '2016-02-11T18:07:49.000Z',
    )
  })

  it('reads title from the documented position', () => {
    expect(transformContact(makeRaw({ position: 'CSM' })).title).toBe('CSM')
  })

  it('does not read undocumented ownerId or createdAt', () => {
    const result = transformContact(
      makeRaw({
        ownerId: 'u1',
        createdAt: '2020-01-01T00:00:00.000Z',
      } as Partial<RawPlanhatContact>),
    )
    expect(result.owner_id).toBeUndefined()
    expect(result.created_at).toBeUndefined()
  })

  it('handles a record with only _id', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })
})

describe('planhat untransformContact', () => {
  it('maps company_id to companyId', () => {
    const result = untransformContact({ company_id: 'comp-1' })
    expect(result.companyId).toBe('comp-1')
  })
})
