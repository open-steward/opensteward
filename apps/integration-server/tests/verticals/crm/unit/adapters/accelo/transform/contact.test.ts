import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawAcceloContact,
} from '../../../../../../../src/verticals/crm/adapters/accelo/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawAcceloContact> = {}): RawAcceloContact {
  return { id: 'cont-1', ...overrides }
}

describe('accelo transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps firstname to first_name and surname to last_name', () => {
    const result = transformContact(makeRaw({ firstname: 'Jane', surname: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('computes full name from firstname + surname', () => {
    const result = transformContact(makeRaw({ firstname: 'Jane', surname: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('returns undefined name when both are absent', () => {
    expect(transformContact(makeRaw()).name).toBeUndefined()
  })

  it('maps email', () => {
    expect(transformContact(makeRaw({ email: 'jane@example.com' })).email).toBe('jane@example.com')
  })

  it('maps phone and mobile', () => {
    const result = transformContact(makeRaw({ phone: '+14155550101', mobile: '+14155550202' }))
    expect(result.phone).toBe('+14155550101')
    expect(result.mobile).toBe('+14155550202')
  })

  it('resolves company id from numeric company field', () => {
    expect(transformContact(makeRaw({ company: 55 })).company_id).toBe('55')
  })

  it('resolves company id from string company field', () => {
    expect(transformContact(makeRaw({ company: '55' })).company_id).toBe('55')
  })

  it('resolves company id from expanded company object', () => {
    expect(transformContact(makeRaw({ company: { id: 88, name: 'Acme' } })).company_id).toBe('88')
  })

  it('converts unix timestamp date_created to ISO', () => {
    const result = transformContact(makeRaw({ date_created: 1737000000 }))
    expect(result.created_at).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const raw = makeRaw({
      id: '10',
      firstname: 'Jane',
      surname: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+14155550123',
      mobile: '+14155550456',
      company: 42,
      date_created: 1737000000,
      date_modified: 1737086400,
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('accelo untransformContact', () => {
  it('maps first_name back to firstname', () => {
    expect(untransformContact({ first_name: 'Jane' }).firstname).toBe('Jane')
  })

  it('maps last_name back to surname', () => {
    expect(untransformContact({ last_name: 'Doe' }).surname).toBe('Doe')
  })

  it('maps email back', () => {
    expect(untransformContact({ email: 'jane@example.com' }).email).toBe('jane@example.com')
  })

  it('maps company_id back to company_id field', () => {
    expect(untransformContact({ company_id: '55' }).company_id).toBe('55')
  })

  it('round-trips first_name, last_name, email', () => {
    const raw = makeRaw({
      firstname: 'Alice',
      surname: 'Smith',
      email: 'alice@example.com',
    })
    const canonical = transformContact(raw)
    const back = untransformContact(canonical)
    expect(back.firstname).toBe('Alice')
    expect(back.surname).toBe('Smith')
    expect(back.email).toBe('alice@example.com')
  })
})
