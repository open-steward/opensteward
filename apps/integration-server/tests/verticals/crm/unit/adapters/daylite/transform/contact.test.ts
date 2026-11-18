import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawDayliteContact,
} from '../../../../../../../src/verticals/crm/adapters/daylite/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawDayliteContact> = {}): RawDayliteContact {
  return { self: '/v1/contacts/1', ...overrides }
}

describe('daylite transformContact', () => {
  it('extracts id from self URL', () => {
    expect(transformContact(makeRaw({ self: '/v1/contacts/42' })).id).toBe('42')
  })

  it('maps first_name and last_name', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('picks first email from emails array', () => {
    const result = transformContact(
      makeRaw({ emails: [{ address: 'jane@example.com', label: 'work' }] }),
    )
    expect(result.email).toBe('jane@example.com')
  })

  it('picks first phone from phone_numbers array', () => {
    const result = transformContact(
      makeRaw({ phone_numbers: [{ number: '+15550001111', label: 'mobile' }] }),
    )
    expect(result.phone).toBe('+15550001111')
  })

  it('extracts company_id from first companies entry URL', () => {
    const result = transformContact(makeRaw({ companies: [{ company: '/v1/companies/99' }] }))
    expect(result.company_id).toBe('99')
  })

  it('extracts owner_id from owner URL', () => {
    const result = transformContact(makeRaw({ owner: '/v1/users/7' }))
    expect(result.owner_id).toBe('7')
  })

  it('maps title', () => {
    const result = transformContact(makeRaw({ title: 'CEO' }))
    expect(result.title).toBe('CEO')
  })

  it('passes create_date as created_at', () => {
    const result = transformContact(makeRaw({ create_date: '2026-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('handles missing self URL gracefully', () => {
    expect(() => transformContact(makeRaw({ self: undefined }))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces a ContactSchema-valid result', () => {
    const raw = makeRaw({
      self: '/v1/contacts/1',
      first_name: 'Jane',
      last_name: 'Doe',
      emails: [{ address: 'jane@example.com', label: 'work' }],
      create_date: '2026-01-01T00:00:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('daylite untransformContact', () => {
  it('maps email → emails array', () => {
    const out = untransformContact({ email: 'jane@example.com' })
    expect((out.emails as Array<{ address: string; label: string }>)[0]!.address).toBe(
      'jane@example.com',
    )
    expect((out.emails as Array<{ address: string; label: string }>)[0]!.label).toBe('work')
  })

  it('maps phone → phone_numbers array', () => {
    const out = untransformContact({ phone: '+15550001111' })
    expect((out.phone_numbers as Array<{ number: string; label: string }>)[0]!.number).toBe(
      '+15550001111',
    )
  })

  it('maps first_name and last_name directly', () => {
    const out = untransformContact({ first_name: 'Jane', last_name: 'Doe' })
    expect(out.first_name).toBe('Jane')
    expect(out.last_name).toBe('Doe')
  })

  it('maps title directly', () => {
    const out = untransformContact({ title: 'CEO' })
    expect(out.title).toBe('CEO')
  })
})
