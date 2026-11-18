import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawVitallyUser,
} from '../../../../../../../src/verticals/crm/adapters/vitally/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawVitallyUser> = {}): RawVitallyUser {
  return {
    id: 'usr_001',
    name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    accountIds: ['acc_001', 'acc_002'],
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('vitally transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('usr_001')
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

  it('last_name is undefined for single-word name', () => {
    const raw = makeRaw({ name: 'Madonna' })
    expect(transformContact(raw).last_name).toBeUndefined()
    expect(transformContact(raw).first_name).toBe('Madonna')
  })

  it('handles multi-word last name', () => {
    const raw = makeRaw({ name: 'Jane Van Der Berg' })
    expect(transformContact(raw).last_name).toBe('Van Der Berg')
  })

  it('maps email', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('maps first accountId to company_id', () => {
    expect(transformContact(makeRaw()).company_id).toBe('acc_001')
  })

  it('company_id is undefined when accountIds is empty', () => {
    expect(transformContact(makeRaw({ accountIds: [] })).company_id).toBeUndefined()
  })

  it('maps createdAt to created_at', () => {
    expect(transformContact(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updatedAt to updated_at', () => {
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
    const minimal: RawVitallyUser = { id: 'usr_min' }
    expect(() => ContactSchema.parse(transformContact(minimal))).not.toThrow()
  })

  it('name is undefined when raw.name is empty string', () => {
    expect(transformContact(makeRaw({ name: '' })).name).toBeUndefined()
  })
})

describe('vitally untransformContact', () => {
  it('maps name', () => {
    const out = untransformContact({ name: 'Jane Doe' })
    expect(out.name).toBe('Jane Doe')
  })

  it('maps email', () => {
    const out = untransformContact({ email: 'jane@acme.example' })
    expect(out.email).toBe('jane@acme.example')
  })
})
