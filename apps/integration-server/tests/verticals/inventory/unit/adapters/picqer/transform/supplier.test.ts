import { describe, it, expect } from 'vitest'
import { transformSupplier } from '../../../../../../../src/verticals/inventory/adapters/picqer/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — picqer supplier', () => {
  const raw = {
    idsupplier: 55,
    name: 'Keyboards Inc',
    contactname: 'Jane Doe',
    address: '123 Main St',
    address2: 'Suite 4',
    zipcode: '94105',
    city: 'San Francisco',
    region: 'CA',
    country: 'US',
    telephone: '+14155550199',
    emailaddress: 'orders@keyboards.example',
    remarks: 'Preferred supplier',
    language: 'EN',
  }
  const result = transformSupplier(raw)

  it('sets id from idsupplier as string', () => {
    expect(result.id).toBe('55')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('55')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('sets email from emailaddress', () => {
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('sets phone from telephone', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('sets isActive to true (hardcoded — all returned suppliers are active)', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to picqer', () => {
    expect(result.platform).toBe('picqer')
  })

  it('stores contactname in metadata', () => {
    expect(result.metadata['contactname']).toBe('Jane Doe')
  })

  it('stores city in metadata', () => {
    expect(result.metadata['city']).toBe('San Francisco')
  })

  it('has no defaultCurrency (not available in Picqer supplier API)', () => {
    expect(result.defaultCurrency).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — minimal input', () => {
  const result = transformSupplier({ idsupplier: 1, name: 'Basic Supplier' })

  it('sets email undefined when emailaddress absent', () => {
    expect(result.email).toBeUndefined()
  })

  it('sets phone undefined when telephone absent', () => {
    expect(result.phone).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
