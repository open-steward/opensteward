import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawReplyIoContact,
} from '../../../../../../../src/verticals/crm/adapters/reply-io/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawReplyIoContact> = {}): RawReplyIoContact {
  return {
    id: 42,
    email: 'jane.doe@acme.example',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+14155550100',
    title: 'Head of Finance',
    accountId: 7,
    ownerUserId: 55,
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    createdAt: '2026-01-15T09:30:00.000Z',
    lastModifiedAt: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('reply-io transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw()).id).toBe('42')
  })

  it('maps first_name from firstName', () => {
    expect(transformContact(makeRaw()).first_name).toBe('Jane')
  })

  it('maps last_name from lastName', () => {
    expect(transformContact(makeRaw()).last_name).toBe('Doe')
  })

  it('derives name by joining firstName and lastName', () => {
    expect(transformContact(makeRaw()).name).toBe('Jane Doe')
  })

  it('returns undefined name when both first and last absent', () => {
    const result = transformContact(makeRaw({ firstName: null, lastName: null }))
    expect(result.name).toBeUndefined()
  })

  it('maps email', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('maps phone', () => {
    expect(transformContact(makeRaw()).phone).toBe('+14155550100')
  })

  it('maps title', () => {
    expect(transformContact(makeRaw()).title).toBe('Head of Finance')
  })

  it('maps company_id from accountId', () => {
    expect(transformContact(makeRaw()).company_id).toBe('7')
  })

  it('maps owner_id from ownerUserId', () => {
    expect(transformContact(makeRaw()).owner_id).toBe('55')
  })

  it('maps address.city', () => {
    expect(transformContact(makeRaw()).address?.city).toBe('San Francisco')
  })

  it('maps address.region from state', () => {
    expect(transformContact(makeRaw()).address?.region).toBe('CA')
  })

  it('maps address.country', () => {
    expect(transformContact(makeRaw()).address?.country).toBe('US')
  })

  it('sets address to undefined when city/state/country all absent', () => {
    const result = transformContact(makeRaw({ city: null, state: null, country: null }))
    expect(result.address).toBeUndefined()
  })

  it('maps created_at from createdAt', () => {
    expect(transformContact(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('falls back to addingDate for created_at when createdAt absent', () => {
    const result = transformContact(
      makeRaw({ createdAt: null, addingDate: '2026-01-10T00:00:00.000Z' }),
    )
    expect(result.created_at).toBe('2026-01-10T00:00:00.000Z')
  })

  it('maps updated_at from lastModifiedAt', () => {
    expect(transformContact(makeRaw()).updated_at).toBe('2026-01-20T12:00:00.000Z')
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact round-trips email', () => {
    expect(untransformContact({ email: 'j@acme.example' }).email).toBe('j@acme.example')
  })

  it('untransformContact maps first_name to firstName', () => {
    expect(untransformContact({ first_name: 'John' }).firstName).toBe('John')
  })

  it('untransformContact converts company_id to numeric accountId', () => {
    expect(untransformContact({ company_id: '7' }).accountId).toBe(7)
  })

  it('untransformContact converts owner_id to numeric ownerUserId', () => {
    expect(untransformContact({ owner_id: '55' }).ownerUserId).toBe(55)
  })
})
