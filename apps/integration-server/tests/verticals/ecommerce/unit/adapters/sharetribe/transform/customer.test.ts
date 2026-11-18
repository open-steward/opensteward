import { describe, it, expect } from 'vitest'
import {
  transformUser,
  untransformUser,
  type RawSharetribeUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/sharetribe/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<RawSharetribeUser> = {}): RawSharetribeUser {
  return {
    id: { uuid: 'user-uuid-001' },
    type: 'user',
    attributes: {
      email: 'jane.doe@acme.example',
      emailVerified: true,
      pendingEmail: null,
      state: 'active',
      banned: false,
      deleted: false,
      createdAt: '2026-01-15T09:30:00.000Z',
      profile: {
        firstName: 'Jane',
        lastName: 'Doe',
        displayName: 'Jane Doe',
        abbreviatedName: 'JD',
        bio: 'A seller on the marketplace.',
        publicData: { location: 'San Francisco' },
        protectedData: { phone: '+14155550123' },
        privateData: { notes: 'VIP customer' },
        metadata: { tier: 'gold' },
      },
      stripeConnected: true,
    },
    ...overrides,
  }
}

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser (Sharetribe)', () => {
  it('maps id from uuid wrapper', () => {
    const result = transformUser(makeUser())
    expect(result.id).toBe('user-uuid-001')
  })

  it('maps email from attributes', () => {
    const result = transformUser(makeUser())
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('maps firstName and lastName from profile', () => {
    const result = transformUser(makeUser())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps createdAt', () => {
    const result = transformUser(makeUser())
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('stores state in metadata', () => {
    const result = transformUser(makeUser())
    expect(result.metadata['state']).toBe('active')
  })

  it('stores displayName in metadata', () => {
    const result = transformUser(makeUser())
    expect(result.metadata['displayName']).toBe('Jane Doe')
  })

  it('handles missing profile gracefully', () => {
    const raw = makeUser()
    delete raw.attributes.profile
    const result = transformUser(raw)
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('handles null email', () => {
    const raw = makeUser()
    raw.attributes.email = null
    const result = transformUser(raw)
    expect(result.email).toBeUndefined()
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformUser(makeUser())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

// ── untransformUser ───────────────────────────────────────────────────────────

describe('untransformUser (Sharetribe)', () => {
  it('maps firstName and lastName into profile', () => {
    const body = untransformUser({ firstName: 'Jane', lastName: 'Doe' })
    expect((body['profile'] as Record<string, unknown>)['firstName']).toBe('Jane')
    expect((body['profile'] as Record<string, unknown>)['lastName']).toBe('Doe')
  })

  it('synthesises displayName when both names provided', () => {
    const body = untransformUser({ firstName: 'Jane', lastName: 'Doe' })
    expect((body['profile'] as Record<string, unknown>)['displayName']).toBe('Jane Doe')
  })

  it('omits displayName when only firstName provided', () => {
    const body = untransformUser({ firstName: 'Jane' })
    expect((body['profile'] as Record<string, unknown>)['displayName']).toBeUndefined()
  })
})
