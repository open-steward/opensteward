import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type UhasibuContact } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/contact'

function makeRaw(overrides: Partial<UhasibuContact> = {}): UhasibuContact {
  return {
    id: 'uc-1',
    name: 'Nairobi Supplies',
    email: 'ns@nairobi.ke',
    phone: '+254712345678',
    type: 'customer',
    tax_number: 'A123456789B',
    address: 'Kenyatta Ave',
    city: 'Nairobi',
    region: 'Nairobi County',
    postal_code: '00100',
    country: 'KE',
    is_customer: true,
    is_supplier: false,
    is_active: true,
    ...overrides,
  }
}

describe('uhasibu transformContact', () => {
  it('maps id to id', () => {
    expect(transformContact(makeRaw()).id).toBe('uc-1')
  })

  it('maps name to name', () => {
    expect(transformContact(makeRaw()).name).toBe('Nairobi Supplies')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformContact(makeRaw()).taxNumber).toBe('A123456789B')
  })

  it('maps is_customer=true to isCustomer=true', () => {
    expect(transformContact(makeRaw()).isCustomer).toBe(true)
  })

  it('maps is_active=false to isActive=false', () => {
    expect(transformContact(makeRaw({ is_active: false })).isActive).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
