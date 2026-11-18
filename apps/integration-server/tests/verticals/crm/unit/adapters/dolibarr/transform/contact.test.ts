import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawDolibarrContact } from '../../../../../../../src/verticals/crm/adapters/dolibarr/transform/contact'

function makeRaw(overrides: Partial<RawDolibarrContact> = {}): RawDolibarrContact {
  return { id: '1', ...overrides }
}

describe('dolibarr transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps first and last name', () => {
    const result = transformContact(makeRaw({ firstname: 'Jane', lastname: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('maps phone from phone_pro', () => {
    expect(transformContact(makeRaw({ phone_pro: '123' })).phone).toBe('123')
  })

  it('maps company_id from socid', () => {
    expect(transformContact(makeRaw({ socid: '9' })).company_id).toBe('9')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact maps firstname/lastname', () => {
    const result = untransformContact({ first_name: 'A', last_name: 'B' })
    expect(result.firstname).toBe('A')
    expect(result.lastname).toBe('B')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
