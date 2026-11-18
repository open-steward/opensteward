import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformVendor,
  type PuzzleCustomer,
  type PuzzleVendor,
} from '../../../../../../../src/verticals/accounting/adapters/puzzle/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<PuzzleCustomer> = {}): PuzzleCustomer {
  return {
    id: 'cust-pzl-1',
    name: 'Acme Corp',
    companyName: 'Acme Corporation',
    email: 'contact@acme.com',
    phoneNumber: '+15551234567',
    status: 'Active',
    type: 'Business',
    billingAddressJson: {
      street: '100 Main Ave',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
      country: 'US',
    },
    ...overrides,
  }
}

function makeVendor(overrides: Partial<PuzzleVendor> = {}): PuzzleVendor {
  return {
    id: 'vend-pzl-1',
    name: 'Supplies Inc',
    status: 'Active',
    type: 'Business',
    ...overrides,
  }
}

describe('puzzle transformCustomer', () => {
  it('maps id', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust-pzl-1')
  })

  it('maps name (prefers name over companyName)', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('Acme Corp')
  })

  it('falls back to companyName when name absent', () => {
    expect(transformCustomer(makeCustomer({ name: undefined })).name).toBe('Acme Corporation')
  })

  it('maps companyName', () => {
    expect(transformCustomer(makeCustomer()).companyName).toBe('Acme Corporation')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps Active status to isActive=true', () => {
    expect(transformCustomer(makeCustomer({ status: 'Active' })).isActive).toBe(true)
  })

  it('maps Inactive status to isActive=false', () => {
    expect(transformCustomer(makeCustomer({ status: 'Inactive' })).isActive).toBe(false)
  })

  it('maps email to emails array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.emails?.[0]?.email).toBe('contact@acme.com')
  })

  it('maps phoneNumber to telephones array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.telephones?.[0]?.telephone).toBe('+15551234567')
  })

  it('maps billing address street to address1', () => {
    expect(transformCustomer(makeCustomer()).billingAddress?.address1).toBe('100 Main Ave')
  })

  it('maps billing address city', () => {
    expect(transformCustomer(makeCustomer()).billingAddress?.city).toBe('San Francisco')
  })

  it('maps billing address zip to postalCode', () => {
    expect(transformCustomer(makeCustomer()).billingAddress?.postalCode).toBe('94102')
  })

  it('passes ContactSchema.parse', () => {
    expect(() => ContactSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })
})

describe('puzzle transformVendor', () => {
  it('maps id', () => {
    expect(transformVendor(makeVendor()).id).toBe('vend-pzl-1')
  })

  it('maps name', () => {
    expect(transformVendor(makeVendor()).name).toBe('Supplies Inc')
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformVendor(makeVendor())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps Active status to isActive=true', () => {
    expect(transformVendor(makeVendor({ status: 'Active' })).isActive).toBe(true)
  })

  it('passes ContactSchema.parse', () => {
    expect(() => ContactSchema.parse(transformVendor(makeVendor()))).not.toThrow()
  })
})
