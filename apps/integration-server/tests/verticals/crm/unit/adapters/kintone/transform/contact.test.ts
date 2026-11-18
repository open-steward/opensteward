import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/kintone/transform/contact'
import type { KintoneRecord } from '../../../../../../../src/verticals/crm/adapters/kintone/client'

function makeRaw(extra: Record<string, { value: unknown }> = {}): KintoneRecord {
  return {
    $id: { value: '42' },
    $revision: { value: '1' },
    ...extra,
  }
}

describe('kintone transformContact', () => {
  it('maps $id to id', () => {
    expect(transformContact(makeRaw()).id).toBe('42')
  })

  it('extracts first_name from first_name field', () => {
    const result = transformContact(makeRaw({ first_name: { value: 'Jane' } }))
    expect(result.first_name).toBe('Jane')
  })

  it('extracts email from email field', () => {
    const result = transformContact(makeRaw({ email: { value: 'j@example.com' } }))
    expect(result.email).toBe('j@example.com')
  })

  it('returns undefined for empty field values', () => {
    const result = transformContact(makeRaw({ email: { value: '' } }))
    expect(result.email).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('kintone untransformContact', () => {
  it('wraps fields in value objects', () => {
    const result = untransformContact({ first_name: 'Jane' })
    expect(result['first_name']).toEqual({ value: 'Jane' })
  })
})
