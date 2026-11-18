import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformCustomer,
  transformSupplier,
  type JalebiCustomer,
  type JalebiSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/jalebi/transform/contact'

function makeRawCustomer(overrides: Partial<JalebiCustomer> = {}): JalebiCustomer {
  return {
    id: 'CUST-001',
    name: 'Cairo Bakeries Ltd',
    email: 'orders@cairobakeries.eg',
    phone: '+20221234567',
    address: 'Nasr City, Cairo, Egypt',
    tax_registration: 'EG123456789',
    type: 'customer',
    ...overrides,
  }
}

function makeRawSupplier(overrides: Partial<JalebiSupplier> = {}): JalebiSupplier {
  return {
    id: 'SUPP-001',
    name: 'Flour Importers Co.',
    email: 'supply@flourimporters.eg',
    phone: '+20221111111',
    address: '6th of October, Giza, Egypt',
    tax_registration: 'EG987654321',
    type: 'supplier',
    ...overrides,
  }
}

describe('transformCustomer (jalebi)', () => {
  it('maps core fields correctly', () => {
    const result = transformCustomer(makeRawCustomer())
    expect(result.id).toBe('cust_CUST-001')
    expect(result.name).toBe('Cairo Bakeries Ltd')
    expect(result.identification).toBe('EG123456789')
  })

  it('sets isCustomer to true and isSupplier to false', () => {
    const result = transformCustomer(makeRawCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email to emails array', () => {
    const result = transformCustomer(makeRawCustomer())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('orders@cairobakeries.eg')
  })

  it('maps phone to telephones array', () => {
    const result = transformCustomer(makeRawCustomer())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.length).toBeGreaterThan(0)
    expect(result.telephones![0].telephone).toBe('+20221234567')
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformCustomer(makeRawCustomer({ phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps billingAddress from address', () => {
    const result = transformCustomer(makeRawCustomer())
    expect(result.billingAddress).toBeDefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRawCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits identification when tax_registration is empty', () => {
    const result = transformCustomer(makeRawCustomer({ tax_registration: '' }))
    expect(result.identification).toBeUndefined()
  })

  it('omits name when name is empty', () => {
    const result = transformCustomer(makeRawCustomer({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('prefixes id with cust_', () => {
    const result = transformCustomer(makeRawCustomer({ id: 42 }))
    expect(result.id).toBe('cust_42')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCustomer(makeRawCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier (jalebi)', () => {
  it('maps core fields correctly', () => {
    const result = transformSupplier(makeRawSupplier())
    expect(result.id).toBe('supp_SUPP-001')
    expect(result.name).toBe('Flour Importers Co.')
    expect(result.identification).toBe('EG987654321')
  })

  it('sets isCustomer to false and isSupplier to true', () => {
    const result = transformSupplier(makeRawSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('prefixes id with supp_', () => {
    const result = transformSupplier(makeRawSupplier({ id: 77 }))
    expect(result.id).toBe('supp_77')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRawSupplier()
    const result = transformSupplier(raw)
    expect(result.metadata).toBe(raw)
  })
})
