import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawWorkbooksContact,
} from '../../../../../../../src/verticals/crm/adapters/workbooks/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawWorkbooksContact> = {}): RawWorkbooksContact {
  return { id: 'contact-1', ...overrides }
}

describe('workbooks transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
    expect(transformContact(makeRaw({ id: 'contact-99' })).id).toBe('contact-99')
  })

  it('maps person_first_name to first_name', () => {
    expect(transformContact(makeRaw({ person_first_name: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps person_last_name to last_name', () => {
    expect(transformContact(makeRaw({ person_last_name: 'Doe' })).last_name).toBe('Doe')
  })

  it('uses raw name field as display name when provided', () => {
    const result = transformContact(
      makeRaw({ name: 'Jane Doe', person_first_name: 'Jane', person_last_name: 'Doe' }),
    )
    expect(result.name).toBe('Jane Doe')
  })

  it('derives name from first+last when raw name is absent', () => {
    const result = transformContact(makeRaw({ person_first_name: 'Jane', person_last_name: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('derives name from first name alone when last is absent', () => {
    const result = transformContact(makeRaw({ person_first_name: 'Jane' }))
    expect(result.name).toBe('Jane')
  })

  it('sets name to undefined when all name parts are absent', () => {
    expect(transformContact(makeRaw()).name).toBeUndefined()
  })

  it('maps main_location[email] to email', () => {
    const result = transformContact(makeRaw({ 'main_location[email]': 'jane.doe@acme.example' }))
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('maps main_location[telephone] to phone', () => {
    const result = transformContact(makeRaw({ 'main_location[telephone]': '+14155550123' }))
    expect(result.phone).toBe('+14155550123')
  })

  it('maps main_location[mobile] to mobile', () => {
    const result = transformContact(makeRaw({ 'main_location[mobile]': '+14155550124' }))
    expect(result.mobile).toBe('+14155550124')
  })

  it('maps person_job_title to title', () => {
    expect(transformContact(makeRaw({ person_job_title: 'Head of Finance' })).title).toBe(
      'Head of Finance',
    )
  })

  it('maps assigned_to_id to owner_id as string', () => {
    expect(transformContact(makeRaw({ assigned_to_id: 7 })).owner_id).toBe('7')
    expect(transformContact(makeRaw({ assigned_to_id: 'u-5' })).owner_id).toBe('u-5')
  })

  it('sets owner_id to undefined when assigned_to_id is absent', () => {
    expect(transformContact(makeRaw()).owner_id).toBeUndefined()
  })

  it('maps created_at and updated_at', () => {
    const result = transformContact(
      makeRaw({
        created_at: '2026-01-15T09:30:00.000Z',
        updated_at: '2026-02-01T14:20:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('includes raw object in metadata', () => {
    const raw = makeRaw({ person_first_name: 'Jane' })
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const raw = makeRaw({
      name: 'Jane Doe',
      person_first_name: 'Jane',
      person_last_name: 'Doe',
      person_job_title: 'Head of Finance',
      'main_location[email]': 'jane.doe@acme.example',
      'main_location[telephone]': '+14155550123',
      'main_location[mobile]': '+14155550124',
      assigned_to_id: 'u-1',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('workbooks untransformContact', () => {
  it('maps first_name back to person_first_name', () => {
    expect(untransformContact({ first_name: 'Jane' }).person_first_name).toBe('Jane')
  })

  it('maps last_name back to person_last_name', () => {
    expect(untransformContact({ last_name: 'Doe' }).person_last_name).toBe('Doe')
  })

  it('maps email back to main_location[email]', () => {
    expect(untransformContact({ email: 'jane.doe@acme.example' })['main_location[email]']).toBe(
      'jane.doe@acme.example',
    )
  })

  it('maps phone back to main_location[telephone]', () => {
    expect(untransformContact({ phone: '+14155550123' })['main_location[telephone]']).toBe(
      '+14155550123',
    )
  })

  it('maps mobile back to main_location[mobile]', () => {
    expect(untransformContact({ mobile: '+14155550124' })['main_location[mobile]']).toBe(
      '+14155550124',
    )
  })

  it('maps title back to person_job_title', () => {
    expect(untransformContact({ title: 'Head of Finance' }).person_job_title).toBe(
      'Head of Finance',
    )
  })

  it('omits fields not provided', () => {
    const result = untransformContact({})
    expect(result).not.toHaveProperty('person_first_name')
    expect(result).not.toHaveProperty('person_last_name')
    expect(result).not.toHaveProperty('main_location[email]')
  })

  it('round-trips first_name, last_name, and email', () => {
    const raw = makeRaw({
      person_first_name: 'Jane',
      person_last_name: 'Doe',
      'main_location[email]': 'jane.doe@acme.example',
    })
    const canonical = transformContact(raw)
    const back = untransformContact(canonical)
    expect(back.person_first_name).toBe('Jane')
    expect(back.person_last_name).toBe('Doe')
    expect(back['main_location[email]']).toBe('jane.doe@acme.example')
  })
})
