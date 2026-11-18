import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawDatapelContact,
} from '../../../../../../../src/verticals/inventory/adapters/datapel/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('datapel transformSupplier', () => {
  const raw: RawDatapelContact = {
    contactid: 55,
    firstname: 'Acme',
    lastname: 'Corp',
    isindividual: false,
    isinactive: false,
    currencycode: 'AUD',
    contacttype: 'Supplier',
    cardidentification: 'ACM001',
    companyid: 'ACME',
    createdat: '2024-03-01T00:00:00Z',
    updatedat: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from contactid', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('builds name from firstname and lastname', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Corp')
  })

  it('falls back to companyid when no first/last name', () => {
    const result = transformSupplier({ contactid: 56, companyid: 'GLOBEX' })
    expect(result.name).toBe('GLOBEX')
  })

  it('falls back to cardidentification when no name or companyid', () => {
    const result = transformSupplier({ contactid: 57, cardidentification: 'SUP-007' })
    expect(result.name).toBe('SUP-007')
  })

  it('maps defaultCurrency from currencycode', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('AUD')
  })

  it('sets isActive to true when isinactive is false', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when isinactive is true', () => {
    const result = transformSupplier({ ...raw, isinactive: true })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to datapel', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('datapel')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
