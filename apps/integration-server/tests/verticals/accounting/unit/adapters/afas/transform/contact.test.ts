import { describe, it, expect } from 'vitest'
import {
  transformDebtor,
  transformCreditor,
  type AfasDebtor,
  type AfasCreditor,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeDebtor(overrides: Partial<AfasDebtor> = {}): AfasDebtor {
  return {
    DbId: 'D001',
    DbName: 'Acme BV',
    DbAddress: 'Keizersgracht 1',
    DbPostalCode: '1015 CN',
    DbCity: 'Amsterdam',
    DbCountryIso: 'NL',
    DbEmail: 'info@acme.nl',
    DbPhone: '+31201234567',
    DbVatNr: 'NL123456789B01',
    DbCurrency: 'EUR',
    DbIsActive: true,
    ...overrides,
  }
}

function makeCreditor(overrides: Partial<AfasCreditor> = {}): AfasCreditor {
  return {
    CrId: 'C001',
    CrName: 'Supplier NV',
    CrAddress: 'Damrak 5',
    CrPostalCode: '1012 LG',
    CrCity: 'Amsterdam',
    CrCountryIso: 'NL',
    CrEmail: 'supplier@example.nl',
    CrPhone: '+31209876543',
    CrVatNr: 'NL987654321B01',
    CrCurrency: 'EUR',
    CrIsActive: true,
    ...overrides,
  }
}

describe('transformDebtor (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformDebtor(makeDebtor())
    expect(result.id).toBe('deb_D001')
    expect(result.name).toBe('Acme BV')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.currency).toBe('EUR')
    expect(result.taxNumber).toBe('NL123456789B01')
  })

  it('sets phone as WORK telephone', () => {
    const result = transformDebtor(makeDebtor())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+31201234567')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDebtor()
    const result = transformDebtor(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformDebtor(makeDebtor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformCreditor (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditor(makeCreditor())
    expect(result.id).toBe('crd_C001')
    expect(result.name).toBe('Supplier NV')
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
    expect(result.currency).toBe('EUR')
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformCreditor(makeCreditor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
