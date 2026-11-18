import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawMegaventorySupplierClient,
} from '../../../../../../../src/verticals/inventory/adapters/megaventory/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'
import {
  transformLocation,
  type RawMegaventoryLocation,
} from '../../../../../../../src/verticals/inventory/adapters/megaventory/transform/location'

describe('megaventory suppliers', () => {
  function raw(over: Partial<RawMegaventorySupplierClient> = {}): RawMegaventorySupplierClient {
    return {
      SupplierClientID: 5357,
      SupplierClientType: 'Supplier',
      SupplierClientName: 'Keyboards Inc',
      SupplierClientEmail: 'orders@keyboards.example',
      SupplierClientPhone1: '+14155550199',
      SupplierClientPhone2: '',
      SupplierClientTaxID: 'GB123456789',
      SupplierClientBillingAddress: '1 Trade Park, Leeds',
      ...over,
    }
  }

  it('produces canonical output that satisfies the schema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw()))).not.toThrow()
  })

  it('maps identity and contact', () => {
    const s = transformSupplier(raw())
    expect(s.id).toBe('5357')
    expect(s.name).toBe('Keyboards Inc')
    expect(s.email).toBe('orders@keyboards.example')
    expect(s.phone).toBe('+14155550199')
  })

  it('falls back to the second phone when the first is empty', () => {
    expect(
      transformSupplier(raw({ SupplierClientPhone1: '', SupplierClientPhone2: '+441132000000' }))
        .phone,
    ).toBe('+441132000000')
  })

  it('drops a free-text email that is not a single address', () => {
    // The field is free text; a value like "sales@x.com, ops@x.com" fails the
    // canonical z.email() and would reject the whole record.
    const s = transformSupplier(raw({ SupplierClientEmail: 'sales@x.example, ops@x.example' }))
    expect(s.email).toBeUndefined()
    expect(() => SupplierSchema.parse(s)).not.toThrow()
  })

  it('keeps the record type visible so a mis-filtered sync is detectable', () => {
    // SupplierClientGet returns customers too; the adapter filters the
    // request, and the type it got back stays on the record.
    expect(transformSupplier(raw()).metadata['SupplierClientType']).toBe('Supplier')
  })
})

describe('megaventory locations', () => {
  function raw(over: Partial<RawMegaventoryLocation> = {}): RawMegaventoryLocation {
    return {
      InventoryLocationID: 3409,
      InventoryLocationName: 'Dropshipping',
      InventoryLocationAbbreviation: 'Dr-Sh',
      InventoryLocationAddress: '',
      InventoryLocationCurrencyCode: 'USD',
      ...over,
    }
  }

  it('produces canonical output that satisfies the schema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw()))).not.toThrow()
  })

  it('maps identity, name and abbreviation', () => {
    const l = transformLocation(raw())
    expect(l.id).toBe('3409')
    expect(l.name).toBe('Dropshipping')
    expect(l.code).toBe('Dr-Sh')
    expect(l.type).toBe('warehouse')
  })

  it('treats an empty abbreviation as absent', () => {
    expect(transformLocation(raw({ InventoryLocationAbbreviation: '' })).code).toBeUndefined()
  })

  it('does not split a free-text address into structured fields', () => {
    // InventoryLocationAddress is one string. Splitting on commas guesses
    // field boundaries and gets them wrong for most of the world.
    const l = transformLocation(raw({ InventoryLocationAddress: '1 Trade Park, Leeds, LS1 1AA' }))
    expect(l.address).toBeUndefined()
    expect(l.metadata['InventoryLocationAddress']).toBe('1 Trade Park, Leeds, LS1 1AA')
  })
})
