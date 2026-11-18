import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawLemlistContact,
} from '../../../../../../../src/verticals/crm/adapters/lemlist/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawLemlistContact> = {}): RawLemlistContact {
  return { _id: 'lead_1', ...overrides }
}

describe('lemlist transformContact', () => {
  it('maps _id to string id', () => {
    expect(transformContact(makeRaw({ _id: 'lead_42' })).id).toBe('lead_42')
  })

  it('maps fields.firstName to first_name', () => {
    expect(transformContact(makeRaw({ fields: { firstName: 'Jane' } })).first_name).toBe('Jane')
  })

  it('maps fields.lastName to last_name', () => {
    expect(transformContact(makeRaw({ fields: { lastName: 'Doe' } })).last_name).toBe('Doe')
  })

  it('builds name from fields.firstName + fields.lastName', () => {
    expect(transformContact(makeRaw({ fields: { firstName: 'Jane', lastName: 'Doe' } })).name).toBe(
      'Jane Doe',
    )
  })

  it('falls back to fullName when no fields name parts', () => {
    expect(transformContact(makeRaw({ fullName: 'Jane Doe', fields: {} })).name).toBe('Jane Doe')
  })

  it('maps email', () => {
    expect(transformContact(makeRaw({ email: 'jane@example.com' })).email).toBe('jane@example.com')
  })

  it('maps fields.phone to phone', () => {
    expect(transformContact(makeRaw({ fields: { phone: '+1-555-1234' } })).phone).toBe(
      '+1-555-1234',
    )
  })

  it('maps fields.jobTitle to title', () => {
    expect(transformContact(makeRaw({ fields: { jobTitle: 'Engineer' } })).title).toBe('Engineer')
  })

  it('maps ownerId to owner_id', () => {
    expect(transformContact(makeRaw({ ownerId: 'user_7' })).owner_id).toBe('user_7')
  })

  it('maps createdAt to created_at', () => {
    expect(transformContact(makeRaw({ createdAt: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces a ContactSchema-valid result', () => {
    const raw = makeRaw({
      _id: 'lead_1',
      email: 'jane@example.com',
      ownerId: 'user_7',
      createdAt: '2026-01-01T00:00:00.000Z',
      fields: {
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+1-555-1234',
        jobTitle: 'Engineer',
      },
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('lemlist untransformContact', () => {
  it('maps email', () => {
    expect(untransformContact({ email: 'jane@example.com' }).email).toBe('jane@example.com')
  })

  it('maps first_name to firstName', () => {
    expect(untransformContact({ first_name: 'Jane' }).firstName).toBe('Jane')
  })

  it('maps last_name to lastName', () => {
    expect(untransformContact({ last_name: 'Doe' }).lastName).toBe('Doe')
  })

  it('maps phone', () => {
    expect(untransformContact({ phone: '+1-555-1234' }).phone).toBe('+1-555-1234')
  })

  it('maps title to jobTitle', () => {
    expect(untransformContact({ title: 'Engineer' }).jobTitle).toBe('Engineer')
  })

  it('round-trips email, first_name, last_name', () => {
    const canonical = transformContact(
      makeRaw({
        email: 'jane@example.com',
        fields: { firstName: 'Jane', lastName: 'Doe' },
      }),
    )
    const wire = untransformContact(canonical)
    expect(wire.email).toBe('jane@example.com')
    expect(wire.firstName).toBe('Jane')
    expect(wire.lastName).toBe('Doe')
  })
})
