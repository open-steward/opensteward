import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type MisaAmisPartner,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/contact'

function makeRaw(overrides: Partial<MisaAmisPartner> = {}): MisaAmisPartner {
  return {
    id: 'partner-001',
    partner_name: 'Công ty ABC',
    partner_code: 'ABC',
    tax_code: '0123456789',
    email: 'abc@example.com',
    phone: '0901234567',
    address: '123 Lê Lợi',
    city: 'Hồ Chí Minh',
    province: 'TP.HCM',
    country: 'VN',
    is_customer: true,
    is_supplier: false,
    currency_code: 'VND',
    is_active: true,
    ...overrides,
  }
}

describe('transformContact (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('partner-001')
    expect(result.name).toBe('Công ty ABC')
    expect(result.identification).toBe('ABC')
    expect(result.taxNumber).toBe('0123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('VND')
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('abc@example.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to telephone', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('0901234567')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps address fields', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 Lê Lợi')
    expect(result.billingAddress?.city).toBe('Hồ Chí Minh')
    expect(result.billingAddress?.region).toBe('TP.HCM')
    expect(result.billingAddress?.country).toBe('VN')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles supplier contacts', () => {
    const result = transformContact(makeRaw({ is_customer: false, is_supplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeRaw({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
