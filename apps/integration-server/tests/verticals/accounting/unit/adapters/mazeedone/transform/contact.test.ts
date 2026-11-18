import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformClient,
  transformSupplier,
  type MazeedOneClient,
  type MazeedOneSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/mazeedone/transform/contact'

function makeRawClient(overrides: Partial<MazeedOneClient> = {}): MazeedOneClient {
  return {
    id: 'CLIENT-001',
    name: 'Riyadh Tech Solutions',
    email: 'info@riyadhtech.sa',
    phone: '+966550001234',
    address: 'KAEC, Jeddah, Saudi Arabia',
    tax_reg_no: 'VAT310987654321003',
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

function makeRawSupplier(overrides: Partial<MazeedOneSupplier> = {}): MazeedOneSupplier {
  return {
    id: 'SUPP-001',
    name: 'Gulf Supplies Trading',
    email: 'orders@gulfsupplies.sa',
    phone: '+966551234567',
    address: 'Industrial City, Jeddah, Saudi Arabia',
    tax_reg_no: 'VAT311234567890003',
    is_customer: false,
    is_supplier: true,
    ...overrides,
  }
}

describe('transformClient (mazeedone)', () => {
  it('maps core fields correctly', () => {
    const result = transformClient(makeRawClient())
    expect(result.id).toBe('client_CLIENT-001')
    expect(result.name).toBe('Riyadh Tech Solutions')
    expect(result.identification).toBe('VAT310987654321003')
  })

  it('maps isCustomer and isSupplier from is_customer and is_supplier', () => {
    const result = transformClient(makeRawClient())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email to emails array', () => {
    const result = transformClient(makeRawClient())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('info@riyadhtech.sa')
  })

  it('maps phone to telephones array', () => {
    const result = transformClient(makeRawClient())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.length).toBeGreaterThan(0)
    expect(result.telephones![0].telephone).toBe('+966550001234')
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformClient(makeRawClient({ phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps billingAddress from address', () => {
    const result = transformClient(makeRawClient())
    expect(result.billingAddress).toBeDefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRawClient()
    const result = transformClient(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits identification when tax_reg_no is empty', () => {
    const result = transformClient(makeRawClient({ tax_reg_no: '' }))
    expect(result.identification).toBeUndefined()
  })

  it('omits name when name is empty', () => {
    const result = transformClient(makeRawClient({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('prefixes id with client_', () => {
    const result = transformClient(makeRawClient({ id: 99 }))
    expect(result.id).toBe('client_99')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformClient(makeRawClient())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier (mazeedone)', () => {
  it('maps core fields correctly', () => {
    const result = transformSupplier(makeRawSupplier())
    expect(result.id).toBe('supp_SUPP-001')
    expect(result.name).toBe('Gulf Supplies Trading')
    expect(result.identification).toBe('VAT311234567890003')
  })

  it('maps isCustomer and isSupplier from is_customer and is_supplier', () => {
    const result = transformSupplier(makeRawSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('prefixes id with supp_', () => {
    const result = transformSupplier(makeRawSupplier({ id: 55 }))
    expect(result.id).toBe('supp_55')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRawSupplier()
    const result = transformSupplier(raw)
    expect(result.metadata).toBe(raw)
  })
})
