import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformClient,
  transformSupplier,
  type FatouaClient,
  type FatouaSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/fatoura/transform/contact'

function makeClient(overrides: Partial<FatouaClient> = {}): FatouaClient {
  return {
    id: 'cl1',
    name: 'Riyadh Retail Co',
    email: 'info@riyadhretail.sa',
    mobile: '+966501234567',
    address: '10 King Fahd Rd, Riyadh',
    vat_number: 'SA300111222333',
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<FatouaSupplier> = {}): FatouaSupplier {
  return {
    id: 'sup1',
    name: 'Jeddah Wholesale Ltd',
    email: 'procurement@jeddahwhole.sa',
    mobile: '+966509876543',
    address: '55 Madinah Rd, Jeddah',
    vat_number: 'SA300444555666',
    is_customer: false,
    is_supplier: true,
    ...overrides,
  }
}

describe('transformClient (fatoura)', () => {
  it('maps core fields correctly', () => {
    const result = transformClient(makeClient())
    expect(result.id).toBe('cl1')
    expect(result.name).toBe('Riyadh Retail Co')
    expect(result.taxNumber).toBe('SA300111222333')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeClient()
    const result = transformClient(raw)
    expect(result.metadata).toBe(raw)
  })

  it('respects is_customer and is_supplier flags from raw', () => {
    const result = transformClient(makeClient({ is_customer: true, is_supplier: false }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('falls back to isCustomer=true when is_customer undefined', () => {
    const raw = makeClient()
    delete raw.is_customer
    delete raw.is_supplier
    const result = transformClient(raw)
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email into emails array', () => {
    const result = transformClient(makeClient())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('info@riyadhretail.sa')
  })

  it('maps mobile into telephones array with MOBILE type', () => {
    const result = transformClient(makeClient())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+966501234567')
    expect(result.telephones![0].type).toBe('MOBILE')
  })

  it('maps billing address', () => {
    const result = transformClient(makeClient())
    expect(result.billingAddress).toBeDefined()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformClient({ id: 'c2' })
    expect(result.id).toBe('c2')
    expect(result.name).toBeUndefined()
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformClient(makeClient())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier (fatoura)', () => {
  it('maps core fields correctly', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.id).toBe('sup1')
    expect(result.name).toBe('Jeddah Wholesale Ltd')
    expect(result.taxNumber).toBe('SA300444555666')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSupplier()
    const result = transformSupplier(raw)
    expect(result.metadata).toBe(raw)
  })

  it('falls back to isCustomer=false and isSupplier=true when flags undefined', () => {
    const raw = makeSupplier()
    delete raw.is_customer
    delete raw.is_supplier
    const result = transformSupplier(raw)
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps mobile into telephones array with MOBILE type', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].type).toBe('MOBILE')
  })
})
