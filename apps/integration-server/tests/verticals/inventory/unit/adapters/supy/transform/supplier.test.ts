import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSupySupplier,
} from '../../../../../../../src/verticals/inventory/adapters/supy/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

function makeRaw(overrides: Partial<RawSupySupplier> = {}): RawSupySupplier {
  return {
    id: 'sup-9',
    name: 'Fresh Farms LLC',
    email: 'orders@freshfarms.example',
    phone: '+97141234567',
    contactName: 'Ahmed',
    currency: 'AED',
    leadTimeDays: 3,
    status: 'active',
    paymentTerms: 'NET30',
    ...overrides,
  }
}

describe('transformSupplier (supy)', () => {
  it('maps id and externalId', () => {
    const result = transformSupplier(makeRaw())
    expect(result.id).toBe('sup-9')
    expect(result.externalId).toBe('sup-9')
  })

  it('maps name, email, and phone', () => {
    const result = transformSupplier(makeRaw())
    expect(result.name).toBe('Fresh Farms LLC')
    expect(result.email).toBe('orders@freshfarms.example')
    expect(result.phone).toBe('+97141234567')
  })

  it('maps defaultCurrency', () => {
    const result = transformSupplier(makeRaw())
    expect(result.defaultCurrency).toBe('AED')
  })

  it('maps defaultLeadTimeDays from leadTimeDays', () => {
    const result = transformSupplier(makeRaw({ leadTimeDays: 3 }))
    expect(result.defaultLeadTimeDays).toBe(3)
  })

  it('isActive is true when status is "active"', () => {
    const result = transformSupplier(makeRaw({ status: 'active' }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when status is anything other than "active"', () => {
    const result = transformSupplier(makeRaw({ status: 'inactive' }))
    expect(result.isActive).toBe(false)
  })

  it('isActive defaults to true when status is absent', () => {
    const result = transformSupplier(makeRaw({ status: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('platform is "supy"', () => {
    const result = transformSupplier(makeRaw())
    expect(result.platform).toBe('supy')
  })

  it('passes SupplierSchema validation', () => {
    const result = transformSupplier(makeRaw())
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
