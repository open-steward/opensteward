import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawLoxoPerson,
} from '../../../../../../../src/verticals/crm/adapters/loxo/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawLoxoPerson> = {}): RawLoxoPerson {
  return { id: 1, ...overrides }
}

describe('loxo transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 55 })).id).toBe('55')
  })

  it('maps first_name and last_name', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('picks primary email from emails array', () => {
    const raw = makeRaw({
      emails: [
        { address: 'secondary@example.com', is_primary: false },
        { address: 'primary@example.com', is_primary: true },
      ],
    })
    expect(transformContact(raw).email).toBe('primary@example.com')
  })

  it('falls back to first email when none is primary', () => {
    const raw = makeRaw({
      emails: [{ address: 'only@example.com', is_primary: false }],
    })
    expect(transformContact(raw).email).toBe('only@example.com')
  })

  it('picks primary phone from phones array', () => {
    const raw = makeRaw({
      phones: [
        { number: '+10000000000', is_primary: false },
        { number: '+12125550100', is_primary: true },
      ],
    })
    expect(transformContact(raw).phone).toBe('+12125550100')
  })

  it('maps current_title to title', () => {
    expect(transformContact(makeRaw({ current_title: 'VP Sales' })).title).toBe('VP Sales')
  })

  it('maps owned_by_id to owner_id as string', () => {
    expect(transformContact(makeRaw({ owned_by_id: 3 })).owner_id).toBe('3')
  })

  it('returns undefined owner_id when owned_by_id is null', () => {
    expect(transformContact(makeRaw({ owned_by_id: null })).owner_id).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    const raw: RawLoxoPerson = {
      id: 1,
      first_name: 'Jane',
      last_name: 'Doe',
      name: 'Jane Doe',
      emails: [{ address: 'jane.doe@example.com', is_primary: true }],
      phones: [{ number: '+12125550100', is_primary: true }],
      current_title: 'Head of Finance',
      owned_by_id: 9,
      created_at: '2024-01-15T09:30:00.000Z',
      updated_at: '2024-02-01T14:20:00.000Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('loxo untransformContact', () => {
  it('maps name', () => {
    expect(untransformContact({ name: 'Jane Doe' }).name).toBe('Jane Doe')
  })

  it('maps email to nested emails array', () => {
    const result = untransformContact({ email: 'jane@example.com' })
    expect(result.emails).toEqual([{ address: 'jane@example.com', is_primary: true }])
  })

  it('maps phone to nested phones array', () => {
    const result = untransformContact({ phone: '+12125550100' })
    expect(result.phones).toEqual([{ number: '+12125550100', is_primary: true }])
  })

  it('maps title to current_title', () => {
    expect(untransformContact({ title: 'VP Sales' }).current_title).toBe('VP Sales')
  })
})
