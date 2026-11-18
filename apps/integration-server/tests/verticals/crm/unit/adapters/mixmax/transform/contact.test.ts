import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawMixmaxContact,
} from '../../../../../../../src/verticals/crm/adapters/mixmax/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawMixmaxContact> = {}): RawMixmaxContact {
  return {
    _id: 'cont_abc',
    firstName: 'Jane',
    lastName: 'Doe',
    name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    company: 'Acme Corp',
    phone: '+14155550123',
    title: 'Head of Finance',
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('mixmax transformContact', () => {
  it('maps _id to string id', () => {
    expect(transformContact(makeRaw()).id).toBe('cont_abc')
  })

  it('falls back to id field when _id is absent', () => {
    expect(transformContact(makeRaw({ _id: undefined, id: 'alt_id' })).id).toBe('alt_id')
  })

  it('maps firstName and lastName', () => {
    const result = transformContact(makeRaw())
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('uses provided name field as display name', () => {
    expect(transformContact(makeRaw()).name).toBe('Jane Doe')
  })

  it('builds name from firstName+lastName when name is absent', () => {
    const result = transformContact(makeRaw({ name: undefined }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email to email', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('maps phone and title', () => {
    const result = transformContact(makeRaw())
    expect(result.phone).toBe('+14155550123')
    expect(result.title).toBe('Head of Finance')
  })

  it('converts ISO string timestamps via toIsoDatetime', () => {
    const result = transformContact(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('untransformContact maps first_name, last_name, email, phone, title', () => {
    const out = untransformContact({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+1111',
      title: 'CEO',
    })
    expect(out.firstName).toBe('Jane')
    expect(out.lastName).toBe('Doe')
    expect(out.email).toBe('jane@example.com')
    expect(out.phone).toBe('+1111')
    expect(out.title).toBe('CEO')
  })
})
