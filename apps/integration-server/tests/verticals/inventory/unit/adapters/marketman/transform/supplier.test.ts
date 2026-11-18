/**
 * MarketMan GetVendors → canonical Supplier.
 *
 * Fixture: the "GetVendors Success" example response of POST
 * https://api.marketman.com/v3/buyers/items/GetVendors in MarketMan's own
 * collection (https://api-doc.marketman.com/api/collections/10610779/T1LPET6f?segregateAuth=true&versionTag=latest).
 * Its output table documents the Vendors array as Name, Guid ("Vendor
 * guid"), TaxLevelID, CreditAccountName, ExpenseAccount, IncomeAccountName and
 * EnabledForOrders; the example response carries DebitAccountName in
 * ExpenseAccount's place.
 */
import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawMarketmanSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/marketman/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

/** The documented example response's `Vendors`, verbatim. */
const DOC_VENDORS: RawMarketmanSupplier[] = [
  {
    Name: ' My Vendor ',
    Guid: 'adfef1a111b09ab396c2d323f3',
    TaxLevelID: 1,
    CreditAccountName: 'Vendor ExAccount',
    DebitAccountName: 'Food',
    IncomeAccountName: null,
    EnabledForOrders: true,
  },
  {
    Name: 'My 2nd Vendor',
    Guid: '444',
    TaxLevelID: 1,
    CreditAccountName: '111333222',
    DebitAccountName: 'Cost of Goods Sold',
    IncomeAccountName: null,
  },
]

describe('marketman transformSupplier (documented GetVendors example)', () => {
  it('parses every documented example vendor with SupplierSchema', () => {
    for (const raw of DOC_VENDORS) {
      expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
    }
  })

  it('maps id and externalId from Guid ("Vendor guid")', () => {
    const s = SupplierSchema.parse(transformSupplier(DOC_VENDORS[0]!))
    expect(s.id).toBe('adfef1a111b09ab396c2d323f3')
    expect(s.externalId).toBe('adfef1a111b09ab396c2d323f3')
    expect(SupplierSchema.parse(transformSupplier(DOC_VENDORS[1]!)).id).toBe('444')
  })

  it('maps name from Name, as the platform sends it', () => {
    expect(SupplierSchema.parse(transformSupplier(DOC_VENDORS[0]!)).name).toBe(' My Vendor ')
    expect(SupplierSchema.parse(transformSupplier(DOC_VENDORS[1]!)).name).toBe('My 2nd Vendor')
  })

  it('does not read the undocumented VendorGuid/VendorName', () => {
    expect(() =>
      transformSupplier({ VendorGuid: 'v1', VendorName: 'Old shape' } as RawMarketmanSupplier),
    ).toThrow(/Guid/)
  })

  it('refuses a vendor with no Guid rather than inventing an id', () => {
    expect(() => transformSupplier({ Name: 'nameless' })).toThrow(/Guid/)
  })

  it('carries the documented account fields in metadata, skipping nulls', () => {
    const s = SupplierSchema.parse(transformSupplier(DOC_VENDORS[0]!))
    expect(s.metadata).toEqual({
      TaxLevelID: '1',
      CreditAccountName: 'Vendor ExAccount',
      DebitAccountName: 'Food',
      EnabledForOrders: 'true',
    })
  })

  it('refuses a vendor with no Name rather than inventing one', () => {
    expect(() => transformSupplier({ Guid: '444' })).toThrow(/444 has no Name/)
  })

  it('carries ExpenseAccount and IncomeAccountName when the platform sends them', () => {
    // The Vendors output table documents both as strings ("Debit account name
    // in Marketman", "Income account name in Marketman"); the saved example
    // omits ExpenseAccount and nulls IncomeAccountName, so this is the second
    // example vendor with those two documented fields set.
    const raw: RawMarketmanSupplier = {
      ...DOC_VENDORS[1]!,
      ExpenseAccount: 'Cost of Goods Sold',
      IncomeAccountName: 'Sales',
    }
    const s = SupplierSchema.parse(transformSupplier(raw))
    expect(s.metadata['ExpenseAccount']).toBe('Cost of Goods Sold')
    expect(s.metadata['IncomeAccountName']).toBe('Sales')
  })

  it('sets no contact, currency or lead time: GetVendors documents none', () => {
    const s = SupplierSchema.parse(transformSupplier(DOC_VENDORS[1]!))
    expect(s.email).toBeUndefined()
    expect(s.phone).toBeUndefined()
    expect(s.defaultCurrency).toBeUndefined()
    expect(s.defaultLeadTimeDays).toBeUndefined()
  })

  it('is active: GetVendors returns the vendors "your account is connected to"', () => {
    expect(SupplierSchema.parse(transformSupplier(DOC_VENDORS[1]!)).isActive).toBe(true)
  })

  it('sets platform to marketman and keeps the raw vendor', () => {
    const s = SupplierSchema.parse(transformSupplier(DOC_VENDORS[1]!))
    expect(s.platform).toBe('marketman')
    expect(s.raw).toEqual(DOC_VENDORS[1])
  })
})
