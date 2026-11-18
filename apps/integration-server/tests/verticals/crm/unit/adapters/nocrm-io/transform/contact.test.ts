import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawNocrmContact,
} from '../../../../../../../src/verticals/crm/adapters/nocrm-io/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawNocrmContact> = {}): RawNocrmContact {
  return {
    id: 7,
    contact_name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    phone: '+14155550123',
    tags: ['vip', 'q1'],
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    user: { id: 5 },
    status: 'customer',
    ...overrides,
  }
}

describe('nocrm-io transformContact', () => {
  it('maps id (number) to string id', () => {
    expect(transformContact(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps contact_name to name, first_name, last_name', () => {
    const result = transformContact(makeRaw())
    expect(result.name).toBe('Jane Doe')
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('handles single-word contact_name (no last name)', () => {
    const result = transformContact(makeRaw({ contact_name: 'Cher' }))
    expect(result.first_name).toBe('Cher')
    expect(result.last_name).toBeUndefined()
  })

  it('maps email to email', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('maps phone', () => {
    expect(transformContact(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps user.id to owner_id string', () => {
    expect(transformContact(makeRaw()).owner_id).toBe('5')
  })

  it('maps status to stage', () => {
    expect(transformContact(makeRaw()).stage).toBe('customer')
  })

  it('maps tags array', () => {
    expect(transformContact(makeRaw()).tags).toEqual(['vip', 'q1'])
  })

  it('maps created_at / updated_at', () => {
    const result = transformContact(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('untransformContact builds contact_name from first+last', () => {
    const out = untransformContact({ first_name: 'Jane', last_name: 'Doe' })
    expect(out['contact_name']).toBe('Jane Doe')
  })

  it('untransformContact sets title from contact_name', () => {
    const out = untransformContact({ first_name: 'Jane', last_name: 'Doe' })
    expect(out['title']).toBe('Jane Doe')
  })
})
