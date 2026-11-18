import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawOnePageCrmContact,
} from '../../../../../../../src/verticals/crm/adapters/onepagecrm/transform/contact'

function makeRaw(overrides: Partial<RawOnePageCrmContact> = {}): RawOnePageCrmContact {
  return { id: '1', ...overrides }
}

describe('onepagecrm transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: '42' })).id).toBe('42')
  })

  it('maps first_name and last_name', () => {
    const result = transformContact(makeRaw({ first_name: 'John', last_name: 'Doe' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Doe')
  })

  it('picks first matching phone number', () => {
    const result = transformContact(makeRaw({
      phone_numbers: [{ type: 'work', value: '555-1234' }],
    }))
    expect(result.phone).toBe('555-1234')
  })

  it('maps company_id', () => {
    const result = transformContact(makeRaw({ company_id: 'c1' }))
    expect(result.company_id).toBe('c1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: '42' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('onepagecrm untransformContact', () => {
  it('maps phone to phone_numbers array', () => {
    const result = untransformContact({ phone: '555-0000' })
    expect((result['phone_numbers'] as Array<Record<string, unknown>>)[0]!['value']).toBe('555-0000')
  })
})
