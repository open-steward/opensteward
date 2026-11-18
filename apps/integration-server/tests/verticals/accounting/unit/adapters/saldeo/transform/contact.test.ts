import { describe, it, expect } from 'vitest'
import {
  transformContractor,
  type SaldeoContractor,
} from '../../../../../../../src/verticals/accounting/adapters/saldeo/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContractor(overrides: Partial<SaldeoContractor> = {}): SaldeoContractor {
  return {
    CONTRACTOR_ID: 'ctr-100',
    SHORT_NAME: 'Acme Sp.',
    FULL_NAME: 'Acme Spółka z o.o.',
    SUPPLIER: 'false',
    CUSTOMER: 'true',
    VAT_NUMBER: 'PL1234567890',
    CITY: 'Warszawa',
    POSTCODE: '00-001',
    STREET: 'ul. Marszałkowska 1',
    COUNTRY_ISO3166A2: 'PL',
    TELEPHONE: '+48-22-123-4567',
    EMAILS: ['biuro@acme.pl'],
    INACTIVE: 'false',
    _raw: '<CONTRACTOR><CONTRACTOR_ID>ctr-100</CONTRACTOR_ID></CONTRACTOR>',
    ...overrides,
  }
}

describe('transformContractor', () => {
  it('maps id from CONTRACTOR_ID', () => {
    const result = transformContractor(makeContractor())
    expect(result.id).toBe('ctr-100')
  })

  it('maps name from SHORT_NAME preferring over FULL_NAME', () => {
    const result = transformContractor(makeContractor())
    expect(result.name).toBe('Acme Sp.')
  })

  it('falls back to FULL_NAME when SHORT_NAME is absent', () => {
    const result = transformContractor(makeContractor({ SHORT_NAME: undefined }))
    expect(result.name).toBe('Acme Spółka z o.o.')
  })

  it('maps companyName from FULL_NAME', () => {
    const result = transformContractor(makeContractor())
    expect(result.companyName).toBe('Acme Spółka z o.o.')
  })

  it('maps taxNumber from VAT_NUMBER', () => {
    const result = transformContractor(makeContractor())
    expect(result.taxNumber).toBe('PL1234567890')
  })

  it('sets isCustomer=true and isSupplier=false for a customer', () => {
    const result = transformContractor(makeContractor({ CUSTOMER: 'true', SUPPLIER: 'false' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('sets isSupplier=true and isCustomer=false for a supplier', () => {
    const result = transformContractor(makeContractor({ CUSTOMER: 'false', SUPPLIER: 'true' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('sets both isCustomer and isSupplier true for a dual-role contractor', () => {
    const result = transformContractor(makeContractor({ CUSTOMER: 'true', SUPPLIER: 'true' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('defaults isCustomer to true when neither CUSTOMER nor SUPPLIER is set', () => {
    const result = transformContractor(makeContractor({ CUSTOMER: undefined, SUPPLIER: undefined }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps INACTIVE=false to isActive=true', () => {
    const result = transformContractor(makeContractor({ INACTIVE: 'false' }))
    expect(result.isActive).toBe(true)
  })

  it('maps INACTIVE=true to isActive=false', () => {
    const result = transformContractor(makeContractor({ INACTIVE: 'true' }))
    expect(result.isActive).toBe(false)
  })

  it('maps TELEPHONE to telephones with type WORK', () => {
    const result = transformContractor(makeContractor())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0]).toEqual({ telephone: '+48-22-123-4567', type: 'WORK' })
  })

  it('maps EMAILS to emails array', () => {
    const result = transformContractor(makeContractor())
    expect(result.emails).toBeDefined()
    expect(result.emails![0]).toMatchObject({ email: 'biuro@acme.pl' })
  })

  it('maps billing address fields', () => {
    const result = transformContractor(makeContractor())
    expect(result.billingAddress?.city).toBe('Warszawa')
    expect(result.billingAddress?.postalCode).toBe('00-001')
    expect(result.billingAddress?.address1).toBe('ul. Marszałkowska 1')
    expect(result.billingAddress?.country).toBe('PL')
  })

  it('maps metadata to { _xml: raw._raw } — not the whole contractor', () => {
    const raw = makeContractor()
    const result = transformContractor(raw)
    expect(result.metadata).toEqual({ _xml: raw._raw })
  })

  it('returns undefined id when CONTRACTOR_ID is empty string', () => {
    const result = transformContractor(makeContractor({ CONTRACTOR_ID: '' }))
    expect(result.id).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformContractor(makeContractor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
