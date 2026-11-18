import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawStoreFeederSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/store-feeder/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — store-feeder', () => {
  const raw: RawStoreFeederSupplier = {
    SupplierID: 10,
    SupplierGUID: 'sup-guid-abc',
    Name: 'Keyboards Inc',
    SupplierCode: 'KBD',
    Email: 'orders@keyboards.example',
    MinimumOrderValue: 100,
    Reference: 'REF-001',
    AccountNumber: 'ACC-001',
    CurrencyCode: 'GBP',
    SupplierAddress: {
      ContactName: 'Bob Builder',
      Phone: '+14155550199',
      Mobile: '+14155550200',
    },
  }
  const result = transformSupplier(raw)

  it('maps id from SupplierID as string', () => {
    expect(result.id).toBe('10')
  })

  it('maps name from Name', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps email', () => {
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone from SupplierAddress.Phone (preferred over Mobile)', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from CurrencyCode', () => {
    expect(result.defaultCurrency).toBe('GBP')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('stores supplierCode in metadata', () => {
    expect(result.metadata['supplierCode']).toBe('KBD')
  })

  it('stores accountNumber in metadata', () => {
    expect(result.metadata['accountNumber']).toBe('ACC-001')
  })

  it('sets platform to store-feeder', () => {
    expect(result.platform).toBe('store-feeder')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — store-feeder SupplierGUID fallback', () => {
  const raw: RawStoreFeederSupplier = {
    SupplierGUID: 'sup-guid-xyz',
    Name: 'Fallback Vendor',
    Currency: { CurrencyCode: 'USD' },
  }
  const result = transformSupplier(raw)

  it('uses SupplierGUID as id when SupplierID absent', () => {
    expect(result.id).toBe('sup-guid-xyz')
  })

  it('maps defaultCurrency from Currency.CurrencyCode when CurrencyCode absent', () => {
    expect(result.defaultCurrency).toBe('USD')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — store-feeder Mobile fallback', () => {
  const raw: RawStoreFeederSupplier = {
    SupplierID: 20,
    Name: 'Mobile Only Vendor',
    SupplierAddress: {
      Mobile: '+15105550300',
    },
  }
  const result = transformSupplier(raw)

  it('falls back phone to Mobile when Phone is absent', () => {
    expect(result.phone).toBe('+15105550300')
  })
})
