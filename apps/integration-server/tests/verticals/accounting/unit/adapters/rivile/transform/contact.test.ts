import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type RivileContact } from '../../../../../../../src/verticals/accounting/adapters/rivile/transform/contact'

function makeContact(overrides: Partial<RivileContact> = {}): RivileContact {
  return {
    id: '33',
    name: 'UAB Lithuanian Ltd',
    pvm_kodas: 'LT100001234512',
    email: 'admin@lt.ltd',
    ...overrides,
  }
}

describe('transformContact (rivile)', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('33')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('UAB Lithuanian Ltd')
  })

  it('maps pvm_kodas to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('LT100001234512')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('admin@lt.ltd')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('sets isSupplier false', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('handles missing email', () => {
    expect(transformContact(makeContact({ email: undefined })).emails).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
