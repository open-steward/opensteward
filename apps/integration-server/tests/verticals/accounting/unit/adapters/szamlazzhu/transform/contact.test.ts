import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SzamlazzhuContact } from '../../../../../../../src/verticals/accounting/adapters/szamlazzhu/transform/contact'

function makeContact(overrides: Partial<SzamlazzhuContact> = {}): SzamlazzhuContact {
  return {
    id: '80',
    name: 'Budapest Zrt',
    taxNumber: '11111111-1-41',
    email: 'info@budapest.hu',
    ...overrides,
  }
}

describe('transformContact (szamlazzhu)', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('80')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Budapest Zrt')
  })

  it('maps taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('11111111-1-41')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@budapest.hu')
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
