import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSkulabsDistributor,
} from '../../../../../../../src/verticals/inventory/adapters/skulabs/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('skulabs transformSupplier', () => {
  const raw: RawSkulabsDistributor = {
    _id: 'dist-100',
    name: 'Global Parts Inc',
    phone: '+14155550100',
    email: 'orders@globalparts.example',
    active: true,
    address: {
      street: '200 Industrial Park',
      street_2: 'Unit B',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
    },
    terms: 'Net 30',
    shipping: 'FOB',
    memo: 'Primary supplier',
    location_id: 'loc-001',
  }

  it('maps _id to id and externalId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('dist-100')
    expect(result.externalId).toBe('dist-100')
  })

  it('maps name to name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Global Parts Inc')
  })

  it('maps email to email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@globalparts.example')
  })

  it('maps phone to phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14155550100')
  })

  it('maps active true to isActive true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps active false to isActive false', () => {
    const inactive: RawSkulabsDistributor = { ...raw, active: false }
    expect(transformSupplier(inactive).isActive).toBe(false)
  })

  it('defaults isActive to true when active is absent', () => {
    const noActive: RawSkulabsDistributor = { ...raw, active: undefined }
    expect(transformSupplier(noActive).isActive).toBe(true)
  })

  it('sets email to undefined when email is null', () => {
    const noEmail: RawSkulabsDistributor = { ...raw, email: null }
    expect(transformSupplier(noEmail).email).toBeUndefined()
  })

  it('sets platform to skulabs', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('skulabs')
  })

  it('satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
