import { describe, it, expect } from 'vitest'
import {
  transformPayee,
  type TipaltiPayee,
} from '../../../../../../../src/verticals/accounting/adapters/tipalti/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<TipaltiPayee> = {}): TipaltiPayee {
  return {
    id: 'payee-001',
    name: 'Acme Vendor',
    status: 'ACTIVE',
    companyName: 'Acme Vendor LLC',
    taxId: 'US-111222333',
    contact: {
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@acme.example',
      phone: '+1-555-200-3000',
    },
    address: {
      line1: '789 Commerce Blvd',
      line2: 'Unit 5',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: 'US',
    },
    currency: 'USD',
    portalUrl: 'https://app.tipalti.example/portal/payee-001',
    createdAt: '2024-01-10T08:00:00.000Z',
    updatedAt: '2024-02-05T12:00:00.000Z',
    ...overrides,
  }
}

describe('tipalti transformPayee', () => {
  it('maps id', () => {
    expect(transformPayee(makeRaw()).id).toBe('payee-001')
  })

  it('maps name', () => {
    expect(transformPayee(makeRaw()).name).toBe('Acme Vendor')
  })

  it('maps companyName', () => {
    expect(transformPayee(makeRaw()).companyName).toBe('Acme Vendor LLC')
  })

  it('maps contact.firstName to firstName', () => {
    expect(transformPayee(makeRaw()).firstName).toBe('John')
  })

  it('maps contact.lastName to lastName', () => {
    expect(transformPayee(makeRaw()).lastName).toBe('Smith')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformPayee(makeRaw()).taxNumber).toBe('US-111222333')
  })

  it('sets isSupplier=true', () => {
    expect(transformPayee(makeRaw()).isSupplier).toBe(true)
  })

  it('sets isCustomer=false', () => {
    expect(transformPayee(makeRaw()).isCustomer).toBe(false)
  })

  it('maps ACTIVE status to isActive=true', () => {
    expect(transformPayee(makeRaw({ status: 'ACTIVE' })).isActive).toBe(true)
  })

  it('maps BLOCKED status to isActive=false', () => {
    expect(transformPayee(makeRaw({ status: 'BLOCKED' })).isActive).toBe(false)
  })

  it('maps currency', () => {
    expect(transformPayee(makeRaw()).currency).toBe('USD')
  })

  it('maps contact.email to emails array', () => {
    const result = transformPayee(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('john.smith@acme.example')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps contact.phone to telephones array', () => {
    const result = transformPayee(makeRaw())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+1-555-200-3000')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps address to billingAddress', () => {
    const result = transformPayee(makeRaw())
    expect(result.billingAddress?.address1).toBe('789 Commerce Blvd')
    expect(result.billingAddress?.city).toBe('Austin')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.billingAddress?.postalCode).toBe('78701')
  })

  it('maps portalUrl', () => {
    expect(transformPayee(makeRaw()).portalUrl).toBe('https://app.tipalti.example/portal/payee-001')
  })

  it('maps createdAt to Date', () => {
    expect(transformPayee(makeRaw()).createdAt).toEqual(new Date('2024-01-10T08:00:00.000Z'))
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformPayee(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformPayee(raw).metadata).toBe(raw)
  })

  it('handles no contact sub-object gracefully', () => {
    const result = transformPayee(makeRaw({ contact: undefined }))
    expect(result.emails).toBeUndefined()
    expect(result.telephones).toBeUndefined()
  })
})
