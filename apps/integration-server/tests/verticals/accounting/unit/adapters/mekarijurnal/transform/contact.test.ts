import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MekariJurnalContact } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/contact'

function makeContact(overrides: Partial<MekariJurnalContact> = {}): MekariJurnalContact {
  return {
    id: 10,
    display_name: 'PT Maju Jaya',
    contact_type: 'customer',
    email: 'info@majujaya.co.id',
    phone: '+628112345678',
    address: 'Jl. Sudirman 1',
    city: 'Jakarta',
    country_code: 'ID',
    tax_no: '01.234.567.8-999.000',
    ...overrides,
  }
}

describe('transformContact (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('10')
    expect(result.name).toBe('PT Maju Jaya')
    expect(result.taxNumber).toBe('01.234.567.8-999.000')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email correctly', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@majujaya.co.id')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone correctly', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+628112345678')
  })

  it('maps billing address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Jl. Sudirman 1')
    expect(result.billingAddress?.city).toBe('Jakarta')
    expect(result.billingAddress?.country).toBe('ID')
  })

  it('marks vendor type as supplier', () => {
    const result = transformContact(makeContact({ contact_type: 'vendor' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined emails when email is null', () => {
    const result = transformContact(makeContact({ email: null }))
    expect(result.emails).toBeUndefined()
  })

  it('returns undefined telephones when phone is null', () => {
    const result = transformContact(makeContact({ phone: null }))
    expect(result.telephones).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
