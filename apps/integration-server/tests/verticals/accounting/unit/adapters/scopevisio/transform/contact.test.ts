import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type ScopevisioContact,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCompanyRaw(overrides: Partial<ScopevisioContact> = {}): ScopevisioContact {
  return {
    id: 100,
    person: false,
    lastname: 'Acme GmbH',
    customerNumber: 'K-001',
    debitorNumber: 'D-001',
    vatId: 'DE123456789',
    email: 'info@acme.example',
    phone: '+4930123456',
    street2: 'Unter den Linden 1',
    city2: 'Berlin',
    postcode2: '10117',
    country2: 'DE',
    ...overrides,
  }
}

function makePersonRaw(overrides: Partial<ScopevisioContact> = {}): ScopevisioContact {
  return {
    id: 200,
    person: true,
    firstname: 'Hans',
    lastname: 'Müller',
    kreditorNumber: 'KR-001',
    mobile: '+49151000000',
    ...overrides,
  }
}

describe('transformContact (scopevisio) — company', () => {
  it('maps id to string id', () => {
    expect(transformContact(makeCompanyRaw()).id).toBe('100')
  })

  it('sets companyName from lastname when person=false', () => {
    expect(transformContact(makeCompanyRaw()).companyName).toBe('Acme GmbH')
  })

  it('maps vatId to taxNumber', () => {
    expect(transformContact(makeCompanyRaw()).taxNumber).toBe('DE123456789')
  })

  it('maps debitorNumber presence to isCustomer=true', () => {
    expect(transformContact(makeCompanyRaw()).isCustomer).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeCompanyRaw())
    expect(result.emails?.[0]?.email).toBe('info@acme.example')
    expect(result.emails?.[0]?.type).toBe('WORK')
  })

  it('maps phone to WORK telephone', () => {
    const result = transformContact(makeCompanyRaw())
    expect(result.telephones?.[0]?.telephone).toBe('+4930123456')
    expect(result.telephones?.[0]?.type).toBe('WORK')
  })

  it('maps billing address from street2/city2/postcode2/country2', () => {
    const result = transformContact(makeCompanyRaw())
    expect(result.billingAddress?.address1).toBe('Unter den Linden 1')
    expect(result.billingAddress?.city).toBe('Berlin')
    expect(result.billingAddress?.postalCode).toBe('10117')
    expect(result.billingAddress?.country).toBe('DE')
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformContact(makeCompanyRaw()))).not.toThrow()
  })
})

describe('transformContact (scopevisio) — person', () => {
  it('sets firstName and lastName when person=true', () => {
    const result = transformContact(makePersonRaw())
    expect(result.firstName).toBe('Hans')
    expect(result.lastName).toBe('Müller')
  })

  it('maps kreditorNumber presence to isSupplier=true', () => {
    expect(transformContact(makePersonRaw()).isSupplier).toBe(true)
  })

  it('maps mobile to MOBILE telephone', () => {
    const result = transformContact(makePersonRaw())
    const mobile = result.telephones?.find((t) => t.type === 'MOBILE')
    expect(mobile?.telephone).toBe('+49151000000')
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformContact(makePersonRaw()))).not.toThrow()
  })
})
