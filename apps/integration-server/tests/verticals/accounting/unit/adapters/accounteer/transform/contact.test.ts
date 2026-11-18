import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AccounteerContact } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/contact'

function makeRaw(overrides: Partial<AccounteerContact> = {}): AccounteerContact {
  return { id: '1', ...overrides }
}

describe('accounteer transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })
  it('marks as customer when contact_type is customer', () => {
    const result = transformContact(makeRaw({ contact_type: 'customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })
  it('marks as supplier when contact_type is supplier', () => {
    const result = transformContact(makeRaw({ contact_type: 'supplier' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })
  it('defaults is_active to true when missing', () => {
    expect(transformContact(makeRaw()).isActive).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
