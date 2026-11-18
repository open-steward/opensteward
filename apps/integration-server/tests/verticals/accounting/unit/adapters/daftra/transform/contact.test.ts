import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformClient,
  transformSupplier,
  type DaftraClient,
  type DaftraSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/daftra/transform/contact'

function makeClient(overrides: Partial<DaftraClient> = {}): DaftraClient {
  return {
    id: 'c1',
    business_name: 'Cairo Trading Co',
    email: 'info@cairotrade.eg',
    phone1: '+201012345678',
    address1: '10 Tahrir Square, Cairo',
    bn1: 'EG123456789',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<DaftraSupplier> = {}): DaftraSupplier {
  return {
    id: 's1',
    business_name: 'Alexandria Supplies',
    email: 'contact@alexsupplies.eg',
    phone1: '+203111222333',
    address1: '5 Corniche Rd, Alexandria',
    bn1: 'EG987654321',
    ...overrides,
  }
}

describe('transformClient (daftra)', () => {
  it('maps core fields correctly', () => {
    const result = transformClient(makeClient())
    expect(result.id).toBe('c1')
    expect(result.name).toBe('Cairo Trading Co')
    expect(result.taxNumber).toBe('EG123456789')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeClient()
    const result = transformClient(raw)
    expect(result.metadata).toBe(raw)
  })

  it('sets isCustomer=true and isSupplier=false for client', () => {
    const result = transformClient(makeClient())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email into emails array', () => {
    const result = transformClient(makeClient())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('info@cairotrade.eg')
  })

  it('maps phone into telephones array', () => {
    const result = transformClient(makeClient())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+201012345678')
  })

  it('maps billing address', () => {
    const result = transformClient(makeClient())
    expect(result.billingAddress).toBeDefined()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformClient({ id: 'c2' })
    expect(result.id).toBe('c2')
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformClient(makeClient())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier (daftra)', () => {
  it('maps core fields correctly', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.id).toBe('s1')
    expect(result.name).toBe('Alexandria Supplies')
    expect(result.taxNumber).toBe('EG987654321')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSupplier()
    const result = transformSupplier(raw)
    expect(result.metadata).toBe(raw)
  })

  it('sets isCustomer=false and isSupplier=true for supplier', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })
})
