import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type KoraCustomer } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/contact'

function makeRaw(overrides: Partial<KoraCustomer> = {}): KoraCustomer {
  return { id: '1', ...overrides }
}

describe('kora transformContact', () => {
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
  it('sets isCustomer true and isSupplier false', () => {
    const result = transformContact(makeRaw())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })
  it('maps name', () => {
    expect(transformContact(makeRaw({ name: 'John Doe' })).name).toBe('John Doe')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
