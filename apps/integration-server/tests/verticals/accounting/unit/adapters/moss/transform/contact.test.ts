import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type MossSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/moss/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<MossSupplier> = {}): MossSupplier {
  return {
    id: 'sup-001',
    organisationId: 'org-001',
    name: 'Acme Supplies GmbH',
    code: 'ACM',
    currency: 'EUR',
    vatIdNo: 'DE123456789',
    status: 'ACTIVE',
    address: {
      street: '123 Main St',
      city: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    },
    createTime: '2024-02-01T08:00:00.000Z',
    updateTime: '2024-05-10T11:00:00.000Z',
    ...overrides,
  }
}

describe('transformSupplier (moss)', () => {
  it('maps id', () => {
    expect(transformSupplier(makeRaw()).id).toBe('sup-001')
  })

  it('maps name', () => {
    expect(transformSupplier(makeRaw()).name).toBe('Acme Supplies GmbH')
  })

  it('maps vatIdNo to taxNumber', () => {
    expect(transformSupplier(makeRaw()).taxNumber).toBe('DE123456789')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const c = transformSupplier(makeRaw())
    expect(c.isSupplier).toBe(true)
    expect(c.isCustomer).toBe(false)
  })

  it('maps status ACTIVE → isActive true', () => {
    expect(transformSupplier(makeRaw({ status: 'ACTIVE' })).isActive).toBe(true)
  })

  it('maps status non-ACTIVE → isActive false', () => {
    expect(transformSupplier(makeRaw({ status: 'INACTIVE' })).isActive).toBe(false)
  })

  it('maps currency', () => {
    expect(transformSupplier(makeRaw()).currency).toBe('EUR')
  })

  it('maps billing address city', () => {
    expect(transformSupplier(makeRaw()).billingAddress?.city).toBe('Berlin')
  })

  it('maps code to identification', () => {
    expect(transformSupplier(makeRaw()).identification).toBe('ACM')
  })

  it('maps createTime to createdAt Date', () => {
    expect(transformSupplier(makeRaw()).createdAt).toEqual(new Date('2024-02-01T08:00:00.000Z'))
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeRaw()))).not.toThrow()
  })
})
