import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FreeePartner } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/contact'

function makeRaw(overrides: Partial<FreeePartner> = {}): FreeePartner {
  return {
    id: 5001,
    name: 'Test Company',
    display_name: 'Test Company Display',
    email: 'contact@test.jp',
    phone: '03-1234-5678',
    country_code: 'JP',
    long_name: null,
    address_attributes: {
      prefecture_code: '13',
      street_name: '1-2-3 Shinjuku',
      city: 'Shinjuku-ku',
    },
    payer_walletable_id: null,
    ...overrides,
  }
}

describe('transformContact (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('5001')
    expect(result.name).toBe('Test Company Display')
    expect(result.isCustomer).toBe(true)
  })

  it('uses name when display_name is null', () => {
    const result = transformContact(makeRaw({ display_name: null }))
    expect(result.name).toBe('Test Company')
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('contact@test.jp')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('03-1234-5678')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps address_attributes to billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('1-2-3 Shinjuku')
    expect(result.billingAddress?.city).toBe('Shinjuku-ku')
  })

  it('marks as supplier when payer_walletable_id is set', () => {
    const result = transformContact(makeRaw({ payer_walletable_id: 99 }))
    expect(result.isSupplier).toBe(true)
  })

  it('marks as non-supplier when payer_walletable_id is null', () => {
    const result = transformContact(makeRaw({ payer_walletable_id: null }))
    expect(result.isSupplier).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
