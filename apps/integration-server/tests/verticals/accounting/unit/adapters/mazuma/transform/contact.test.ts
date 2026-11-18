import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MazumaContact } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/contact'

function makeRaw(overrides: Partial<MazumaContact> = {}): MazumaContact {
  return { id: '1', ...overrides }
}

describe('mazuma transformContact', () => {
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
  it('marks as customer by default', () => {
    expect(transformContact(makeRaw()).isCustomer).toBe(true)
  })
  it('marks as supplier when contact_type is supplier', () => {
    const result = transformContact(makeRaw({ contact_type: 'supplier' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })
  it('defaults isActive to true', () => {
    expect(transformContact(makeRaw()).isActive).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
