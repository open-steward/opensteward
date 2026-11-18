import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawMembrainContact,
} from '../../../../../../../src/verticals/crm/adapters/membrain/transform/contact'
import { DOC_CONTACT } from '../fixtures/docs'

describe('membrain transformContact', () => {
  it('maps the documented GET /contacts/ example', () => {
    const out = ContactSchema.parse(transformContact(DOC_CONTACT))
    expect(out).toMatchObject({
      id: '32e205ca-5dad-44ef-a02f-65f846170c1d',
      first_name: 'Alicia',
      last_name: 'Vikander',
      name: 'Alicia Vikander',
      email: 'alicia.vikander@membrain.com',
      phone: '616 292 7124',
      mobile: '838 780 8163',
      title: 'SDR',
      company_id: '2cc29974-fa8e-4107-b140-86a0a951f963',
    })
    expect(out.metadata).toEqual(DOC_CONTACT)
  })

  it('reads empty strings and the all-zero CompanyId as absent', () => {
    const raw: RawMembrainContact = {
      ...DOC_CONTACT,
      EmailAddress: '',
      WorkPhone: '',
      CompanyId: '00000000-0000-0000-0000-000000000000',
    }
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.email).toBeUndefined()
    expect(out.phone).toBeUndefined()
    expect(out.company_id).toBeUndefined()
  })

  it('refuses a record with no Id instead of inventing one', () => {
    expect(() => transformContact({ ...DOC_CONTACT, Id: '' })).toThrow(/no Id/)
  })

  it('untransforms Contact to Membrain payload', () => {
    const out = untransformContact({ first_name: 'Anna', email: 'anna@test.se', company_id: '50' })
    expect(out['firstName']).toBe('Anna')
    expect(out['email']).toBe('anna@test.se')
    expect(out['company']).toEqual({ id: '50' })
  })
})
