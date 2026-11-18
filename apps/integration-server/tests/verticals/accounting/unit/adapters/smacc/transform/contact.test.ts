import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SmaccContact } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/contact'

function makeRaw(overrides: Partial<SmaccContact> = {}): SmaccContact {
  return {
    id: 'cont-1',
    name: 'Widget Co',
    email: 'info@widget.com',
    phone: '+491234567890',
    type: 'customer',
    vat_number: 'DE123456789',
    street: 'Main St 1',
    city: 'Berlin',
    zip: '10115',
    country: 'DE',
    is_customer: true,
    is_supplier: false,
    is_active: true,
    ...overrides,
  }
}

describe('smacc transformContact', () => {
  it('maps id to id', () => {
    expect(transformContact(makeRaw()).id).toBe('cont-1')
  })

  it('maps name to name', () => {
    expect(transformContact(makeRaw()).name).toBe('Widget Co')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformContact(makeRaw()).taxNumber).toBe('DE123456789')
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
