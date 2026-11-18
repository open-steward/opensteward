import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawXentralSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/xentral/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const rawSupplier: RawXentralSupplier = {
  id: 'sup-7',
  type: 'supplier',
  general: {
    name: 'Gadget GmbH',
    email: 'einkauf@gadget.de',
    phone: '+4930123456',
    mobile: '+491701234567',
    supplierNumber: 'LF-007',
    department: 'Procurement',
    address: {
      street: 'Hauptstraße 10',
      zip: '10115',
      city: 'Berlin',
      state: 'Berlin',
      country: 'DE',
    },
  },
  tags: [{ id: 'tag-1', key: 'priority', name: 'Preferred' }],
}

describe('xentral transformSupplier', () => {
  it('maps id to id and externalId', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.id).toBe('sup-7')
    expect(result.externalId).toBe('sup-7')
  })

  it('maps general.name to name', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.name).toBe('Gadget GmbH')
  })

  it('maps general.email to email', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.email).toBe('einkauf@gadget.de')
  })

  it('maps general.phone to phone', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.phone).toBe('+4930123456')
  })

  it('sets isActive=true when no inactive tags present', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.isActive).toBe(true)
  })

  it('sets platform=xentral', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.platform).toBe('xentral')
  })

  it('stores supplierNumber in metadata', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.metadata['supplierNumber']).toBe('LF-007')
  })

  it('stores type in metadata', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.metadata['type']).toBe('supplier')
  })

  it('produces a schema-valid Supplier', () => {
    const result = transformSupplier(rawSupplier)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })

  it('sets isActive=false when an "inactive" tag is present', () => {
    const result = transformSupplier({
      ...rawSupplier,
      tags: [{ id: 'tag-2', key: 'status', name: 'inactive' }],
    })
    expect(result.isActive).toBe(false)
  })

  it('falls back to general.mobile when phone is absent', () => {
    const result = transformSupplier({
      ...rawSupplier,
      general: { ...rawSupplier.general, phone: undefined },
    })
    expect(result.phone).toBe('+491701234567')
  })
})
