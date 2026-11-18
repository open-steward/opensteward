import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type DrupalUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/drupal-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<DrupalUser['attributes']> = {}): DrupalUser {
  return {
    type: 'user--user',
    id: 'user-uuid-001',
    attributes: {
      name: 'jdoe',
      mail: 'jdoe@example.com',
      status: true,
      created: 1717200000,
      changed: 1717286400,
      field_first_name: 'Jane',
      field_last_name: 'Doe',
      field_phone: '+1-555-0100',
      ...overrides,
    },
    relationships: {},
  }
}

// ── transformCustomer ─────────────────────────────────────────────────────────

describe('transformCustomer (Drupal Commerce)', () => {
  it('maps core user fields', () => {
    const result = transformCustomer(makeUser())
    expect(result.id).toBe('user-uuid-001')
    expect(result.email).toBe('jdoe@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('+1-555-0100')
  })

  it('converts unix created timestamp to ISO string', () => {
    const result = transformCustomer(makeUser())
    expect(result.createdAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('converts unix changed timestamp to ISO string', () => {
    const result = transformCustomer(makeUser())
    expect(result.updatedAt).toBe('2024-06-02T00:00:00.000Z')
  })

  it('handles missing custom field_first_name gracefully', () => {
    const result = transformCustomer(makeUser({ field_first_name: null }))
    expect(result.firstName).toBeUndefined()
  })

  it('handles missing custom field_last_name gracefully', () => {
    const result = transformCustomer(makeUser({ field_last_name: null }))
    expect(result.lastName).toBeUndefined()
  })

  it('handles missing phone gracefully', () => {
    const result = transformCustomer(makeUser({ field_phone: null }))
    expect(result.phone).toBeUndefined()
  })

  it('does not set acceptsMarketing (Drupal has no native field)', () => {
    const result = transformCustomer(makeUser())
    expect(result.acceptsMarketing).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeUser()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles inactive user (status=false)', () => {
    // Transform still works; caller decides how to filter
    const result = transformCustomer(makeUser({ status: false }))
    expect(result.id).toBe('user-uuid-001')
  })

  it('handles numeric status', () => {
    const result = transformCustomer(makeUser({ status: 1 }))
    expect(result.id).toBe('user-uuid-001')
    expect(result.email).toBe('jdoe@example.com')
  })

  it('handles string unix timestamps', () => {
    const result = transformCustomer(makeUser({ created: '1717200000', changed: '1717286400' }))
    expect(result.createdAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-02T00:00:00.000Z')
  })

  it('handles missing mail gracefully', () => {
    const result = transformCustomer(makeUser({ mail: undefined }))
    expect(result.email).toBeUndefined()
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeUser())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

// ── untransformCustomer ───────────────────────────────────────────────────────

describe('untransformCustomer (Drupal Commerce)', () => {
  it('produces JSON:API body with correct type', () => {
    const body = untransformCustomer({
      email: 'new@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      phone: '+44-20-1234-5678',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('user--user')
    expect(body.data.attributes['mail']).toBe('new@example.com')
    expect(body.data.attributes['field_first_name']).toBe('Alice')
    expect(body.data.attributes['field_last_name']).toBe('Smith')
    expect(body.data.attributes['field_phone']).toBe('+44-20-1234-5678')
  })

  it('omits undefined fields', () => {
    const body = untransformCustomer({ email: 'only@example.com' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['mail']).toBe('only@example.com')
    expect(body.data.attributes['field_first_name']).toBeUndefined()
    expect(body.data.attributes['field_last_name']).toBeUndefined()
  })

  it('handles empty input', () => {
    const body = untransformCustomer({}) as { data: { attributes: Record<string, unknown> } }
    expect(body.data.attributes).toEqual({})
  })
})
