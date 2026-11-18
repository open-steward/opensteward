import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawJobAdderCandidate,
} from '../../../../../../../src/verticals/crm/adapters/jobadder/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawJobAdderCandidate> = {}): RawJobAdderCandidate {
  return { candidateId: 1, ...overrides }
}

describe('jobadder transformContact', () => {
  it('maps candidateId to string id', () => {
    expect(transformContact(makeRaw({ candidateId: 42 })).id).toBe('42')
  })

  it('maps firstName and lastName', () => {
    const result = transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('builds full name from firstName + lastName', () => {
    expect(transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' })).name).toBe('Jane Doe')
  })

  it('maps email', () => {
    expect(transformContact(makeRaw({ email: 'jane@example.com' })).email).toBe('jane@example.com')
  })

  it('maps phone and mobile', () => {
    const result = transformContact(makeRaw({ phone: '+1-555-1234', mobile: '+1-555-5678' }))
    expect(result.phone).toBe('+1-555-1234')
    expect(result.mobile).toBe('+1-555-5678')
  })

  it('maps status.name to stage', () => {
    expect(transformContact(makeRaw({ status: { name: 'Active' } })).stage).toBe('Active')
  })

  it('maps recruiter.userId to owner_id', () => {
    expect(transformContact(makeRaw({ recruiter: { userId: 9 } })).owner_id).toBe('9')
  })

  it('maps address fields', () => {
    const result = transformContact(
      makeRaw({
        address: {
          street: '1 Oak Ave',
          city: 'Portland',
          state: 'OR',
          postalCode: '97201',
          country: 'US',
        },
      }),
    )
    expect(result.address?.line1).toBe('1 Oak Ave')
    expect(result.address?.city).toBe('Portland')
    expect(result.address?.region).toBe('OR')
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
      candidateId: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+1-555-1234',
      mobile: '+1-555-5678',
      status: { name: 'Active' },
      recruiter: { userId: 9 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('jobadder untransformContact', () => {
  it('maps first_name to firstName', () => {
    expect(untransformContact({ first_name: 'Jane' }).firstName).toBe('Jane')
  })

  it('maps last_name to lastName', () => {
    expect(untransformContact({ last_name: 'Doe' }).lastName).toBe('Doe')
  })

  it('maps email', () => {
    expect(untransformContact({ email: 'jane@example.com' }).email).toBe('jane@example.com')
  })

  it('maps phone and mobile', () => {
    const result = untransformContact({ phone: '+1-555-1234', mobile: '+1-555-5678' })
    expect(result.phone).toBe('+1-555-1234')
    expect(result.mobile).toBe('+1-555-5678')
  })

  it('round-trips first_name, last_name, email', () => {
    const canonical = transformContact(
      makeRaw({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }),
    )
    const wire = untransformContact(canonical)
    expect(wire.firstName).toBe('Jane')
    expect(wire.lastName).toBe('Doe')
    expect(wire.email).toBe('jane@example.com')
  })
})
