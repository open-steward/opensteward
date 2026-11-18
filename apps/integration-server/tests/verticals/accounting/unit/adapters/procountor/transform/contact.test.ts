import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type ProcountorContact,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/contact'

function makeContact(overrides: Partial<ProcountorContact> = {}): ProcountorContact {
  return {
    id: 500,
    name: 'Oy Firma Ab',
    businessId: '1234567-8',
    email: 'info@firma.fi',
    phone: '+358401234567',
    street: 'Mannerheimintie 1',
    city: 'Helsinki',
    zip: '00100',
    country: 'FI',
    type: 'CUSTOMER',
    active: true,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id as string', () => {
    expect(transformContact(makeContact()).id).toBe('500')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Oy Firma Ab')
  })

  it('maps businessId to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('1234567-8')
  })

  it('sets isCustomer=true for CUSTOMER type', () => {
    const c = transformContact(makeContact({ type: 'CUSTOMER' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('sets isSupplier=true for SUPPLIER type', () => {
    const c = transformContact(makeContact({ type: 'SUPPLIER' }))
    expect(c.isCustomer).toBe(false)
    expect(c.isSupplier).toBe(true)
  })

  it('sets isCustomer=false and isSupplier=false for PERSON type', () => {
    const c = transformContact(makeContact({ type: 'PERSON' }))
    expect(c.isCustomer).toBe(false)
    expect(c.isSupplier).toBe(false)
  })

  it('maps email to emails array', () => {
    const c = transformContact(makeContact())
    expect(c.emails).toHaveLength(1)
    expect(c.emails![0]).toEqual({ email: 'info@firma.fi', type: 'WORK' })
  })

  it('maps phone to telephones array', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toHaveLength(1)
    expect(c.telephones![0]).toEqual({ telephone: '+358401234567', type: 'WORK' })
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Mannerheimintie 1')
    expect(c.billingAddress?.city).toBe('Helsinki')
    expect(c.billingAddress?.postalCode).toBe('00100')
    expect(c.billingAddress?.country).toBe('FI')
  })

  it('maps active to isActive', () => {
    expect(transformContact(makeContact({ active: true })).isActive).toBe(true)
    expect(transformContact(makeContact({ active: false })).isActive).toBe(false)
  })

  it('returns undefined name when empty', () => {
    expect(transformContact(makeContact({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined emails when email is empty', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
  })

  it('returns undefined telephones when phone is empty', () => {
    expect(transformContact(makeContact({ phone: '' })).telephones).toBeUndefined()
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
