import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawWatiContact,
} from '../../../../../../../src/verticals/crm/adapters/wati/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawWatiContact> = {}): RawWatiContact {
  return {
    id: 'wati_001',
    wa_id: '14155550123',
    name: 'Jane Doe',
    phone: '14155550123',
    created: '2026-01-15T09:30:00.000Z',
    last_updated: '2026-02-01T14:20:00.000Z',
    contact_status: 'active',
    display_name: 'J. Doe',
    ...overrides,
  }
}

describe('wati transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('wati_001')
  })

  it('splits name into first_name (first word)', () => {
    expect(transformContact(makeRaw()).first_name).toBe('Jane')
  })

  it('splits name into last_name (remaining words)', () => {
    expect(transformContact(makeRaw()).last_name).toBe('Doe')
  })

  it('preserves full name', () => {
    expect(transformContact(makeRaw()).name).toBe('Jane Doe')
  })

  it('falls back to display_name when name is absent', () => {
    const raw = makeRaw({ name: undefined, display_name: 'J. Doe' })
    expect(transformContact(raw).name).toBe('J. Doe')
  })

  it('maps phone when non-empty string', () => {
    expect(transformContact(makeRaw()).phone).toBe('14155550123')
  })

  it('phone is undefined when phone is empty string', () => {
    expect(transformContact(makeRaw({ phone: '' })).phone).toBeUndefined()
  })

  it('passes created through toIsoDatetime for created_at', () => {
    expect(transformContact(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes last_updated through toIsoDatetime for updated_at', () => {
    expect(transformContact(makeRaw()).updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('handles minimal input without throwing', () => {
    const minimal: RawWatiContact = { id: 'wati_min' }
    expect(() => ContactSchema.parse(transformContact(minimal))).not.toThrow()
  })

  it('last_name is undefined for single-word name', () => {
    const raw = makeRaw({ name: 'Madonna' })
    expect(transformContact(raw).last_name).toBeUndefined()
    expect(transformContact(raw).first_name).toBe('Madonna')
  })

  it('handles multi-word name splitting correctly', () => {
    const raw = makeRaw({ name: 'Jane Mary Doe' })
    expect(transformContact(raw).first_name).toBe('Jane')
    expect(transformContact(raw).last_name).toBe('Mary Doe')
  })
})

describe('wati untransformContact', () => {
  it('maps name directly', () => {
    const out = untransformContact({ name: 'Jane Doe' })
    expect(out.name).toBe('Jane Doe')
  })

  it('builds name from first_name and last_name when name absent', () => {
    const out = untransformContact({ first_name: 'Jane', last_name: 'Doe' })
    expect(out.name).toBe('Jane Doe')
  })

  it('builds name from first_name only when last_name absent', () => {
    const out = untransformContact({ first_name: 'Jane' })
    expect(out.name).toBe('Jane')
  })

  it('prefers data.name over first/last combination', () => {
    const out = untransformContact({ name: 'Full Name', first_name: 'Jane', last_name: 'Doe' })
    expect(out.name).toBe('Full Name')
  })
})
