/**
 * Fixture fields are Contact.v2.yaml's, with Phone.v2.yaml, E-mail.v2.yaml
 * and Employment.v2.yaml entries:
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Contact.v2.yaml
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawMoskitContact,
} from '../../../../../../../src/verticals/crm/adapters/moskit/transform/contact'

function documented(): RawMoskitContact {
  return {
    id: 101,
    createdBy: { id: 7 },
    responsible: { id: 8 },
    dateCreated: '2020-07-08T18:18:50.000+00:00',
    name: 'Maria Silva',
    cpf: '000.000.000-00',
    primaryEmail: { id: 32 },
    primaryPhone: { id: 42 },
    phones: [
      { id: 41, number: '+55 11 90000-0001', type: { id: 1 } },
      { id: 42, number: '+55 11 90000-0002', type: { id: 2 } },
    ],
    emails: [
      { id: 31, address: 'other@example.com', type: { id: 1 } },
      { id: 32, address: 'maria@example.com', type: { id: 1 } },
    ],
    source: 'MOSKIT_API_V2',
    employers: [{ company: { id: 20 }, contact: { id: 101 }, jobTitle: 'CFO' }],
  }
}

describe('moskit transformContact', () => {
  it('maps the documented fields and satisfies the schema', () => {
    const out = ContactSchema.parse(transformContact(documented()))
    expect(out).toMatchObject({
      id: '101',
      name: 'Maria Silva',
      email: 'maria@example.com',
      phone: '+55 11 90000-0002',
      company_id: '20',
      title: 'CFO',
      owner_id: '8',
      created_at: '2020-07-08T18:18:50.000Z',
    })
  })

  it('takes email and phone from the entries primaryEmail and primaryPhone name', () => {
    const raw = { ...documented(), primaryEmail: { id: 31 }, primaryPhone: { id: 41 } }
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.email).toBe('other@example.com')
    expect(out.phone).toBe('+55 11 90000-0001')
  })

  it('leaves company and title unset when the contact has several employers', () => {
    const raw = {
      ...documented(),
      employers: [{ company: { id: 20 } }, { company: { id: 21 } }],
    }
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.company_id).toBeUndefined()
    expect(out.title).toBeUndefined()
  })

  it('leaves email unset when the primary entry is not a valid address', () => {
    const raw = {
      ...documented(),
      primaryEmail: { id: 1 },
      emails: [{ id: 1, address: 'not an address' }],
    }
    expect(ContactSchema.parse(transformContact(raw)).email).toBeUndefined()
  })

  it('parses a record with only the id', () => {
    const out = ContactSchema.parse(transformContact({ id: 5 }))
    expect(out.id).toBe('5')
    expect(out.email).toBeUndefined()
  })

  it('keeps the raw payload as metadata', () => {
    const raw = documented()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransforms Contact to Moskit payload', () => {
    const out = untransformContact({
      name: 'Maria',
      email: 'maria@test.com',
      company_id: '20',
    })
    expect(out['name']).toBe('Maria')
    expect(out['email']).toBe('maria@test.com')
    expect(out['company']).toEqual({ id: '20' })
  })
})
