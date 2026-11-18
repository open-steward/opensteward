import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SmartaccountsContact } from '../../../../../../../src/verticals/accounting/adapters/smartaccounts/transform/contact'

function makeContact(overrides: Partial<SmartaccountsContact> = {}): SmartaccountsContact {
  return {
    id: '7',
    name: 'Baltic Corp OÜ',
    reg_code: 'EE98765432',
    email: 'billing@baltic.ee',
    phone: '+372 555 1234',
    ...overrides,
  }
}

describe('transformContact (smartaccounts)', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Baltic Corp OÜ')
  })

  it('maps reg_code to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('EE98765432')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('billing@baltic.ee')
  })

  it('maps phone to telephones', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+372 555 1234')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
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
