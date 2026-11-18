import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type DineroContact } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/contact'

function makeContact(overrides: Partial<DineroContact> = {}): DineroContact {
  return {
    ContactGuid: 'contact-guid-001',
    Name: 'Acme ApS',
    VatNumber: 'DK12345678',
    Email: 'info@acme.dk',
    Phone: '+45 12345678',
    Address: 'Nørrebrogade 42',
    City: 'København',
    ZipCode: '2200',
    CountryKey: 'DK',
    IsPerson: false,
    IsHidden: false,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps ContactGuid to id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-guid-001')
  })

  it('maps Name to name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme ApS')
  })

  it('maps VatNumber to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('DK12345678')
  })

  it('maps Email to emails via toWorkEmail', () => {
    const c = transformContact(makeContact())
    expect(c.emails).toHaveLength(1)
    expect(c.emails![0]).toEqual({ email: 'info@acme.dk', type: 'WORK' })
  })

  it('maps Phone to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toHaveLength(1)
    expect(c.telephones![0]).toEqual({ telephone: '+45 12345678', type: 'WORK' })
  })

  it('maps address fields to billingAddress', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Nørrebrogade 42')
    expect(c.billingAddress?.city).toBe('København')
    expect(c.billingAddress?.postalCode).toBe('2200')
    expect(c.billingAddress?.country).toBe('DK')
  })

  it('sets isCustomer=true always', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('sets isSupplier to !IsPerson', () => {
    expect(transformContact(makeContact({ IsPerson: false })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ IsPerson: true })).isSupplier).toBe(false)
  })

  it('maps IsHidden to isActive (inverted)', () => {
    expect(transformContact(makeContact({ IsHidden: false })).isActive).toBe(true)
    expect(transformContact(makeContact({ IsHidden: true })).isActive).toBe(false)
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformContact(makeContact({ Name: '' })).name).toBeUndefined()
  })

  it('returns undefined emails when Email is empty', () => {
    expect(transformContact(makeContact({ Email: '' })).emails).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
