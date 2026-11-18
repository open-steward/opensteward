import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawKommoContact,
} from '../../../../../../../src/verticals/crm/adapters/kommo/transform/contact'

function makeRaw(overrides: Partial<RawKommoContact> = {}): RawKommoContact {
  return { id: 1, ...overrides }
}

describe('kommo transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps name field', () => {
    const result = transformContact(makeRaw({ name: 'John Doe' }))
    expect(result.name).toBe('John Doe')
  })

  it('extracts email from custom_fields_values with EMAIL code', () => {
    const result = transformContact(makeRaw({
      custom_fields_values: [
        { field_code: 'EMAIL', values: [{ value: 'j@example.com' }] },
      ],
    }))
    expect(result.email).toBe('j@example.com')
  })

  it('extracts phone from custom_fields_values with PHONE code', () => {
    const result = transformContact(makeRaw({
      custom_fields_values: [
        { field_code: 'PHONE', values: [{ value: '+12345' }] },
      ],
    }))
    expect(result.phone).toBe('+12345')
  })

  it('converts unix timestamp to ISO string', () => {
    const result = transformContact(makeRaw({ created_at: 0 }))
    expect(result.created_at).toBeUndefined()
  })

  it('maps responsible_user_id to owner_id', () => {
    expect(transformContact(makeRaw({ responsible_user_id: 5 })).owner_id).toBe('5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 10 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('kommo untransformContact', () => {
  it('maps email to custom_fields_values', () => {
    const result = untransformContact({ email: 'k@example.com' })
    const fields = result.custom_fields_values as Array<{ field_code: string; values: Array<{ value: string }> }>
    expect(fields.some((f) => f.field_code === 'EMAIL')).toBe(true)
  })
})
