import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawRecruiterflowContact,
} from '../../../../../../../src/verticals/crm/adapters/recruiterflow/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawRecruiterflowContact> = {}): RawRecruiterflowContact {
  return {
    id: 'cand-42',
    first_name: 'Jane',
    last_name: 'Doe',
    name: 'Jane Doe',
    email: [{ email: 'jane.doe@acme.example', is_primary: true }],
    phone_number: [{ number: '+14155550100', is_primary: true }],
    title: 'Head of Finance',
    lead_owner: { id: 'usr-1', name: 'Owner Name' },
    added_time: '2026-01-15T09:30:00.000Z',
    latest_activity_time: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('recruiterflow transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw()).id).toBe('cand-42')
  })

  it('maps first_name', () => {
    expect(transformContact(makeRaw()).first_name).toBe('Jane')
  })

  it('maps last_name', () => {
    expect(transformContact(makeRaw()).last_name).toBe('Doe')
  })

  it('maps name from raw name field', () => {
    expect(transformContact(makeRaw()).name).toBe('Jane Doe')
  })

  it('derives name from first+last when raw name absent', () => {
    const result = transformContact(makeRaw({ name: undefined }))
    expect(result.name).toBe('Jane Doe')
  })

  it('picks primary email from array', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('falls back to first email when none is_primary', () => {
    const result = transformContact(
      makeRaw({ email: [{ email: 'first@a.com', is_primary: false }] }),
    )
    expect(result.email).toBe('first@a.com')
  })

  it('handles string email', () => {
    expect(transformContact(makeRaw({ email: 'direct@a.com' })).email).toBe('direct@a.com')
  })

  it('picks primary phone from array', () => {
    expect(transformContact(makeRaw()).phone).toBe('+14155550100')
  })

  it('handles string phone_number', () => {
    expect(transformContact(makeRaw({ phone_number: '+19995550000' })).phone).toBe('+19995550000')
  })

  it('maps title', () => {
    expect(transformContact(makeRaw()).title).toBe('Head of Finance')
  })

  it('maps owner_id from lead_owner.id', () => {
    expect(transformContact(makeRaw()).owner_id).toBe('usr-1')
  })

  it('maps created_at from added_time', () => {
    expect(transformContact(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updated_at from latest_activity_time', () => {
    expect(transformContact(makeRaw()).updated_at).toBe('2026-01-20T12:00:00.000Z')
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact wraps email in is_primary array', () => {
    const result = untransformContact({ email: 'j@a.example' })
    expect(result.email).toEqual([{ email: 'j@a.example', is_primary: true }])
  })

  it('untransformContact wraps phone in is_primary array', () => {
    const result = untransformContact({ phone: '+10005550000' })
    expect(result.phone_number).toEqual([{ number: '+10005550000', is_primary: true }])
  })
})
