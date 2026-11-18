import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type TallyLedger,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/contact'

function makeContact(overrides: Partial<TallyLedger> = {}): TallyLedger {
  return {
    NAME: 'Ramesh Traders',
    ADDRESS: '12 Market Road',
    PINCODE: '400001',
    STATENAME: 'Maharashtra',
    COUNTRYNAME: 'India',
    EMAIL: 'ramesh@traders.in',
    PHONE: '+91-22-12345678',
    GSTIN: '27AABCT1332L1ZV',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps NAME to id', () => {
    expect(transformContact(makeContact()).id).toBe('Ramesh Traders')
  })

  it('maps NAME to name', () => {
    expect(transformContact(makeContact()).name).toBe('Ramesh Traders')
  })

  it('maps GSTIN to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('27AABCT1332L1ZV')
  })

  it('always sets isCustomer to true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('always sets isSupplier to false', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('maps EMAIL to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('ramesh@traders.in')
  })

  it('maps PHONE to telephones array', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+91-22-12345678')
  })

  it('maps ADDRESS to billingAddress.address1', () => {
    expect(transformContact(makeContact()).billingAddress?.address1).toBe('12 Market Road')
  })

  it('maps PINCODE to billingAddress.postalCode', () => {
    expect(transformContact(makeContact()).billingAddress?.postalCode).toBe('400001')
  })

  it('maps STATENAME to billingAddress.region', () => {
    expect(transformContact(makeContact()).billingAddress?.region).toBe('Maharashtra')
  })

  it('maps COUNTRYNAME to billingAddress.country', () => {
    expect(transformContact(makeContact()).billingAddress?.country).toBe('IN')
  })

  it('sets emails to undefined when EMAIL is empty', () => {
    expect(transformContact(makeContact({ EMAIL: '' })).emails).toBeUndefined()
  })

  it('sets telephones to undefined when PHONE is empty', () => {
    expect(transformContact(makeContact({ PHONE: '' })).telephones).toBeUndefined()
  })

  it('sets billingAddress to undefined when ADDRESS is empty', () => {
    expect(transformContact(makeContact({ ADDRESS: '' })).billingAddress).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
