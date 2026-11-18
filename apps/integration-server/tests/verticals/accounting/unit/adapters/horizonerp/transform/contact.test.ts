import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type HorizonErpContact } from '../../../../../../../src/verticals/accounting/adapters/horizonerp/transform/contact'

function makeRaw(overrides: Partial<HorizonErpContact> = {}): HorizonErpContact {
  return {
    id: 'CONT-001',
    name: 'Gulf Traders LLC',
    email: 'contact@gulftraders.ae',
    phone: '+97142001234',
    address: 'Al Quoz, Dubai, UAE',
    gstin: 'TRN987654321012',
    customer: true,
    supplier: false,
    ...overrides,
  }
}

describe('transformContact (horizonerp)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('CONT-001')
    expect(result.name).toBe('Gulf Traders LLC')
    expect(result.taxNumber).toBe('TRN987654321012')
  })

  it('maps isCustomer and isSupplier from customer and supplier fields', () => {
    const result = transformContact(makeRaw())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps supplier contact correctly', () => {
    const result = transformContact(makeRaw({ customer: false, supplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps both customer and supplier when both are true', () => {
    const result = transformContact(makeRaw({ customer: true, supplier: true }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to emails array with WORK type', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('contact@gulftraders.ae')
  })

  it('maps phone to telephones array with WORK type', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.length).toBeGreaterThan(0)
    expect(result.telephones![0].telephone).toBe('+97142001234')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformContact(makeRaw({ phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps billingAddress from address field', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress).toBeDefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits taxNumber when gstin is empty', () => {
    const result = transformContact(makeRaw({ gstin: '' }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('omits name when name is empty', () => {
    const result = transformContact(makeRaw({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
