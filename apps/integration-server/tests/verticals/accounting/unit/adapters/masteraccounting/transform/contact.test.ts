import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MasteraccountingContact } from '../../../../../../../src/verticals/accounting/adapters/masteraccounting/transform/contact'

function makeContact(overrides: Partial<MasteraccountingContact> = {}): MasteraccountingContact {
  return {
    id: 'c-1',
    name: 'ТОВ Мастер',
    taxCode: '98765432',
    email: 'info@master.ua',
    phone: '+380671234567',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('c-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('ТОВ Мастер')
  })

  it('maps taxCode to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('98765432')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails![0].email).toBe('info@master.ua')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones![0].telephone).toBe('+380671234567')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('handles missing taxCode', () => {
    expect(transformContact(makeContact({ taxCode: undefined })).taxNumber).toBeUndefined()
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
