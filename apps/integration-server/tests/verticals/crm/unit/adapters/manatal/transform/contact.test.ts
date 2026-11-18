import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawManatalCandidate,
} from '../../../../../../../src/verticals/crm/adapters/manatal/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawManatalCandidate> = {}): RawManatalCandidate {
  return { id: 1, ...overrides }
}

describe('manatal transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 55 })).id).toBe('55')
  })

  it('splits full_name on first space into first_name and last_name', () => {
    const result = transformContact(makeRaw({ full_name: 'Jane Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('sets first_name only when no space in full_name', () => {
    const result = transformContact(makeRaw({ full_name: 'Cher' }))
    expect(result.first_name).toBe('Cher')
    expect(result.last_name).toBeUndefined()
  })

  it('handles multi-word last names correctly (splits on first space only)', () => {
    const result = transformContact(makeRaw({ full_name: 'Mary Anne Jones' }))
    expect(result.first_name).toBe('Mary')
    expect(result.last_name).toBe('Anne Jones')
  })

  it('maps email', () => {
    expect(transformContact(makeRaw({ email: 'jane@example.com' })).email).toBe('jane@example.com')
  })

  it('maps phone_number to phone', () => {
    expect(transformContact(makeRaw({ phone_number: '+12125550100' })).phone).toBe('+12125550100')
  })

  it('maps current_position to title', () => {
    expect(transformContact(makeRaw({ current_position: 'Engineer' })).title).toBe('Engineer')
  })

  it('maps owner to owner_id as string', () => {
    expect(transformContact(makeRaw({ owner: 9 })).owner_id).toBe('9')
  })

  it('returns undefined owner_id when owner is null', () => {
    expect(transformContact(makeRaw({ owner: null })).owner_id).toBeUndefined()
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformContact(makeRaw({ created_at: '2024-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2024-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    const raw: RawManatalCandidate = {
      id: 1,
      full_name: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone_number: '+12125550100',
      current_position: 'Head of Finance',
      owner: 9,
      created_at: '2024-01-15T09:30:00.000Z',
      updated_at: '2024-02-01T14:20:00.000Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('manatal untransformContact', () => {
  it('maps name to full_name', () => {
    expect(untransformContact({ name: 'Jane Doe' }).full_name).toBe('Jane Doe')
  })

  it('combines first_name and last_name into full_name when name absent', () => {
    expect(untransformContact({ first_name: 'Jane', last_name: 'Doe' }).full_name).toBe('Jane Doe')
  })

  it('maps email', () => {
    expect(untransformContact({ email: 'jane@example.com' }).email).toBe('jane@example.com')
  })

  it('maps phone to phone_number', () => {
    expect(untransformContact({ phone: '+12125550100' }).phone_number).toBe('+12125550100')
  })

  it('maps title to current_position', () => {
    expect(untransformContact({ title: 'Engineer' }).current_position).toBe('Engineer')
  })

  it('maps owner_id to numeric owner', () => {
    expect(untransformContact({ owner_id: '9' }).owner).toBe(9)
  })
})
