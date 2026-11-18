import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MeritaktivaContact } from '../../../../../../../src/verticals/accounting/adapters/meritaktiva/transform/contact'

function makeContact(overrides: Partial<MeritaktivaContact> = {}): MeritaktivaContact {
  return {
    Id: '42',
    Name: 'Acme OÜ',
    RegCode: 'EE12345678',
    Email: 'info@acme.ee',
    ...overrides,
  }
}

describe('transformContact (meritaktiva)', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme OÜ')
  })

  it('maps reg_code to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('EE12345678')
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.ee')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('sets isSupplier false', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('handles missing email', () => {
    const result = transformContact(makeContact({ Email: undefined }))
    expect(result.emails).toBeUndefined()
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
