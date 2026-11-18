import { describe, it, expect } from 'vitest'
import {
  transformVendor,
  type MelioVendor,
} from '../../../../../../../src/verticals/accounting/adapters/melio/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeVendor(overrides: Partial<MelioVendor> = {}): MelioVendor {
  return {
    id: 'vnd_001',
    name: 'Acme Supplies',
    accountName: 'Acme Supplies LLC',
    email: 'billing@acme.example',
    taxId: 'US-123456789',
    currency: 'USD',
    isActive: true,
    address: {
      line1: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformVendor (melio)', () => {
  it('maps id', () => {
    expect(transformVendor(makeVendor()).id).toBe('vnd_001')
  })

  it('maps name from name field', () => {
    expect(transformVendor(makeVendor()).name).toBe('Acme Supplies')
  })

  it('maps companyName from accountName field', () => {
    expect(transformVendor(makeVendor()).companyName).toBe('Acme Supplies LLC')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformVendor(makeVendor()).taxNumber).toBe('US-123456789')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const result = transformVendor(makeVendor())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps isActive', () => {
    expect(transformVendor(makeVendor({ isActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when not supplied', () => {
    expect(transformVendor(makeVendor({ isActive: undefined })).isActive).toBe(true)
  })

  it('maps currency', () => {
    expect(transformVendor(makeVendor()).currency).toBe('USD')
  })

  it('maps email as WORK type', () => {
    const result = transformVendor(makeVendor())
    expect(result.emails).toEqual([{ email: 'billing@acme.example', type: 'WORK' }])
  })

  it('produces no emails when email is absent', () => {
    expect(transformVendor(makeVendor({ email: undefined })).emails).toBeUndefined()
  })

  it('maps billing address fields', () => {
    const result = transformVendor(makeVendor())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.region).toBe('CA')
    expect(result.billingAddress?.postalCode).toBe('94105')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('produces no billingAddress when address is absent', () => {
    expect(transformVendor(makeVendor({ address: undefined })).billingAddress).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeVendor()
    expect(transformVendor(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformVendor(makeVendor()))).not.toThrow()
  })
})
