import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawEngageBayContact,
} from '../../../../../../../src/verticals/crm/adapters/engagebay/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawEngageBayContact> = {}): RawEngageBayContact {
  return { id: 1, ...overrides }
}

describe('engagebay transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('extracts first_name from properties name field', () => {
    const raw = makeRaw({ properties: [{ name: 'name', value: 'Jane' }] })
    expect(transformContact(raw).first_name).toBe('Jane')
  })

  it('extracts last_name from properties last_name field', () => {
    const raw = makeRaw({ properties: [{ name: 'last_name', value: 'Doe' }] })
    expect(transformContact(raw).last_name).toBe('Doe')
  })

  it('joins first and last name into name', () => {
    const raw = makeRaw({
      properties: [
        { name: 'name', value: 'Jane' },
        { name: 'last_name', value: 'Doe' },
      ],
    })
    expect(transformContact(raw).name).toBe('Jane Doe')
  })

  it('extracts email from properties', () => {
    const raw = makeRaw({ properties: [{ name: 'email', value: 'jane@example.com' }] })
    expect(transformContact(raw).email).toBe('jane@example.com')
  })

  it('extracts mobile from phone property with mobile subtype', () => {
    const raw = makeRaw({
      properties: [{ name: 'phone', value: '+15550001111', subtype: 'mobile' }],
    })
    expect(transformContact(raw).mobile).toBe('+15550001111')
  })

  it('extracts title from role property', () => {
    const raw = makeRaw({ properties: [{ name: 'role', value: 'VP Sales' }] })
    expect(transformContact(raw).title).toBe('VP Sales')
  })

  it('maps owner_id to string', () => {
    expect(transformContact(makeRaw({ owner_id: 7 })).owner_id).toBe('7')
  })

  it('maps tags array', () => {
    const raw = makeRaw({ tags: [{ tag: 'vip' }, { tag: 'q1' }] })
    expect(transformContact(raw).tags).toEqual(['vip', 'q1'])
  })

  it('returns empty tags array when no tags', () => {
    expect(transformContact(makeRaw()).tags).toEqual([])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation with full input', () => {
    const raw: RawEngageBayContact = {
      id: 42,
      owner_id: 7,
      tags: [{ tag: 'vip' }],
      created_time: 1699000000000,
      updated_time: 1700000000000,
      properties: [
        { name: 'name', value: 'Jane' },
        { name: 'last_name', value: 'Doe' },
        { name: 'email', value: 'jane@example.com' },
        { name: 'phone', value: '+15550001234', subtype: 'work' },
        { name: 'phone', value: '+15550005678', subtype: 'mobile' },
        { name: 'role', value: 'VP Sales' },
      ],
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('engagebay untransformContact', () => {
  it('builds first_name property', () => {
    const result = untransformContact({ first_name: 'Jane' })
    const prop = (result.properties as Array<{ name: string; value?: string }>).find(
      (p) => p.name === 'name',
    )
    expect(prop?.value).toBe('Jane')
  })

  it('builds email property with primary subtype', () => {
    const result = untransformContact({ email: 'jane@example.com' })
    const prop = (
      result.properties as Array<{ name: string; value?: string; subtype?: string }>
    ).find((p) => p.name === 'email')
    expect(prop?.value).toBe('jane@example.com')
    expect(prop?.subtype).toBe('primary')
  })

  it('builds mobile property with mobile subtype', () => {
    const result = untransformContact({ mobile: '+15550001111' })
    const prop = (
      result.properties as Array<{ name: string; value?: string; subtype?: string }>
    ).find((p) => p.name === 'phone' && p.subtype === 'mobile')
    expect(prop?.value).toBe('+15550001111')
  })

  it('converts owner_id to number', () => {
    expect(untransformContact({ owner_id: '7' }).owner_id).toBe(7)
  })

  it('wraps tags in tag objects', () => {
    const result = untransformContact({ tags: ['vip', 'q1'] })
    expect(result.tags).toEqual([{ tag: 'vip' }, { tag: 'q1' }])
  })
})
