import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawKlentyProspect,
} from '../../../../../../../src/verticals/crm/adapters/klenty/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawKlentyProspect> = {}): RawKlentyProspect {
  return { id: 'abc123', Email: 'jane@example.com', ...overrides }
}

describe('klenty transformContact', () => {
  it('maps id to string id when present', () => {
    expect(transformContact(makeRaw({ id: 'abc123' })).id).toBe('abc123')
  })

  it('falls back to Email as id when id is absent', () => {
    const raw: RawKlentyProspect = { Email: 'jane@example.com' }
    expect(transformContact(raw).id).toBe('jane@example.com')
  })

  it('maps FirstName to first_name', () => {
    expect(transformContact(makeRaw({ FirstName: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps LastName to last_name', () => {
    expect(transformContact(makeRaw({ LastName: 'Doe' })).last_name).toBe('Doe')
  })

  it('builds name from FirstName + LastName', () => {
    expect(transformContact(makeRaw({ FirstName: 'Jane', LastName: 'Doe' })).name).toBe('Jane Doe')
  })

  it('prefers FullName over constructed name', () => {
    expect(
      transformContact(makeRaw({ FirstName: 'Jane', LastName: 'Doe', FullName: 'J. Doe' })).name,
    ).toBe('J. Doe')
  })

  it('maps Email to email', () => {
    expect(transformContact(makeRaw()).email).toBe('jane@example.com')
  })

  it('maps Phone to phone', () => {
    expect(transformContact(makeRaw({ Phone: '+1-555-1234' })).phone).toBe('+1-555-1234')
  })

  it('maps Title to title', () => {
    expect(transformContact(makeRaw({ Title: 'Engineer' })).title).toBe('Engineer')
  })

  it('maps assignTo to owner_id', () => {
    expect(transformContact(makeRaw({ assignTo: 'user1' })).owner_id).toBe('user1')
  })

  it('splits comma-separated Tags into array', () => {
    expect(transformContact(makeRaw({ Tags: 'hot lead, vip , renewal' })).tags).toEqual([
      'hot lead',
      'vip',
      'renewal',
    ])
  })

  it('returns undefined tags when Tags is absent', () => {
    expect(transformContact(makeRaw()).tags).toBeUndefined()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces a ContactSchema-valid result', () => {
    const raw = makeRaw({
      id: 'abc123',
      Email: 'jane@example.com',
      FirstName: 'Jane',
      LastName: 'Doe',
      Phone: '+1-555-1234',
      Title: 'Engineer',
      Tags: 'hot lead,vip',
      assignTo: 'user1',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('klenty untransformContact', () => {
  it('maps email to Email', () => {
    expect(untransformContact({ email: 'jane@example.com' }).Email).toBe('jane@example.com')
  })

  it('maps first_name to FirstName', () => {
    expect(untransformContact({ first_name: 'Jane' }).FirstName).toBe('Jane')
  })

  it('maps last_name to LastName', () => {
    expect(untransformContact({ last_name: 'Doe' }).LastName).toBe('Doe')
  })

  it('maps phone to Phone', () => {
    expect(untransformContact({ phone: '+1-555-1234' }).Phone).toBe('+1-555-1234')
  })

  it('maps title to Title', () => {
    expect(untransformContact({ title: 'Engineer' }).Title).toBe('Engineer')
  })

  it('maps owner_id to Owner (POST asymmetry — not assignTo)', () => {
    // NOTE: Klenty GET returns owner in `assignTo`; POST requires `Owner`.
    expect(untransformContact({ owner_id: 'user1' }).Owner).toBe('user1')
  })

  it('joins tags array with pipe separator for POST', () => {
    // POST API requires pipe-separated tags (documented Klenty asymmetry).
    expect(untransformContact({ tags: ['hot lead', 'vip'] }).Tags).toBe('hot lead|vip')
  })

  it('round-trips email, first_name, last_name', () => {
    const canonical = transformContact(
      makeRaw({ FirstName: 'Jane', LastName: 'Doe', Email: 'jane@example.com' }),
    )
    const wire = untransformContact(canonical)
    expect(wire.Email).toBe('jane@example.com')
    expect(wire.FirstName).toBe('Jane')
    expect(wire.LastName).toBe('Doe')
  })
})
