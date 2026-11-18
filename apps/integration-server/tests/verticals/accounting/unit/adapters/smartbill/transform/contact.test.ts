import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SmartbillContact } from '../../../../../../../src/verticals/accounting/adapters/smartbill/transform/contact'

function makeContact(overrides: Partial<SmartbillContact> = {}): SmartbillContact {
  return {
    id: '15',
    name: 'SC Romanian SRL',
    cif: 'RO87654321',
    email: 'contact@romanian.ro',
    phone: '+40 21 1234567',
    ...overrides,
  }
}

describe('transformContact (smartbill)', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('15')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('SC Romanian SRL')
  })

  it('maps cif to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('RO87654321')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('contact@romanian.ro')
  })

  it('maps phone to telephones', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+40 21 1234567')
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
