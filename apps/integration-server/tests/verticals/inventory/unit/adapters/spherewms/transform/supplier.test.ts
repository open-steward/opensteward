import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSphereWmsSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/spherewms/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — spherewms', () => {
  const raw: RawSphereWmsSupplier = {
    supplier_code: 'SUPP-10',
    name: 'Keyboards Inc',
    client_code: 'CLIENT-1',
    client_st_supp: 'KBD',
    contact_name: 'Bob Builder',
    telephone_1: '+14155550199',
    ext_cust_ref: 'REF-XYZ',
    address_1: '10 Commerce Lane',
    city: 'Portland',
    country: 'US',
  }
  const result = transformSupplier(raw)

  it('maps id from supplier_code', () => {
    expect(result.id).toBe('SUPP-10')
  })

  it('maps name from name field', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps phone from telephone_1', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to spherewms', () => {
    expect(result.platform).toBe('spherewms')
  })

  it('stores clientCode in metadata', () => {
    expect(result.metadata['clientCode']).toBe('CLIENT-1')
  })

  it('stores contactName in metadata', () => {
    expect(result.metadata['contactName']).toBe('Bob Builder')
  })

  it('email is undefined (not in source)', () => {
    expect(result.email).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — spherewms numeric supplier_code fallback name', () => {
  const raw: RawSphereWmsSupplier = { supplier_code: 999 }
  const result = transformSupplier(raw)

  it('coerces numeric supplier_code to string id', () => {
    expect(result.id).toBe('999')
  })

  it('falls back name to supplier_code string when name absent', () => {
    expect(result.name).toBe('999')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
