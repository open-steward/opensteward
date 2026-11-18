import { describe, it, expect } from 'vitest'
import {
  transformVendor,
  type MtVendor,
} from '../../../../../../../src/verticals/accounting/adapters/mineraltree/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeVendor(overrides: Partial<MtVendor> = {}): MtVendor {
  return {
    id: 'mt_vnd_001',
    externalId: 'EXT-V-1',
    name: 'Parts Supplier Co',
    taxId: 'US-112233445',
    active: true,
    address: {
      address1: '100 Industrial Way',
      address2: 'Suite 5',
      town: 'Chicago',
      postalCode: '60601',
      ctrySubDivision: 'IL',
      country: 'USA',
    },
    remittanceEmails: ['ap@parts-supplier.example'],
    fundingMethods: [{ id: 'fm_1', type: 'ACH', status: 'active' }],
    ...overrides,
  }
}

describe('transformVendor (mineraltree)', () => {
  it('maps id', () => {
    expect(transformVendor(makeVendor()).id).toBe('mt_vnd_001')
  })

  it('maps name', () => {
    expect(transformVendor(makeVendor()).name).toBe('Parts Supplier Co')
  })

  it('maps externalId to identification', () => {
    expect(transformVendor(makeVendor()).identification).toBe('EXT-V-1')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformVendor(makeVendor()).taxNumber).toBe('US-112233445')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const result = transformVendor(makeVendor())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps active', () => {
    expect(transformVendor(makeVendor({ active: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when active is undefined', () => {
    expect(transformVendor(makeVendor({ active: undefined })).isActive).toBe(true)
  })

  it('maps first remittanceEmail as WORK', () => {
    const result = transformVendor(makeVendor())
    expect(result.emails).toEqual([{ email: 'ap@parts-supplier.example', type: 'WORK' }])
  })

  it('produces no emails when remittanceEmails is absent', () => {
    expect(transformVendor(makeVendor({ remittanceEmails: undefined })).emails).toBeUndefined()
  })

  it('maps address fields (truncates 3-letter ISO country to 2 chars)', () => {
    const result = transformVendor(makeVendor())
    expect(result.billingAddress?.address1).toBe('100 Industrial Way')
    expect(result.billingAddress?.address2).toBe('Suite 5')
    expect(result.billingAddress?.city).toBe('Chicago')
    expect(result.billingAddress?.postalCode).toBe('60601')
    expect(result.billingAddress?.region).toBe('IL')
    // 'USA' → slice(0,2) → 'US'
    expect(result.billingAddress?.country).toBe('US')
  })

  it('produces no billingAddress when address is absent', () => {
    expect(transformVendor(makeVendor({ address: undefined })).billingAddress).toBeUndefined()
  })

  it('maps ACH fundingMethod as ACH payment method', () => {
    const result = transformVendor(makeVendor())
    expect(result.paymentMethods).toHaveLength(1)
    expect(result.paymentMethods![0].type).toBe('ACH')
    expect(result.paymentMethods![0].externalId).toBe('fm_1')
  })

  it('maps CREDITCARD fundingMethod as CARD', () => {
    const result = transformVendor(
      makeVendor({ fundingMethods: [{ id: 'fm_2', type: 'CREDITCARD' }] }),
    )
    expect(result.paymentMethods![0].type).toBe('CARD')
  })

  it('maps unknown fundingMethod type as OTHER', () => {
    const result = transformVendor(
      makeVendor({ fundingMethods: [{ id: 'fm_3', type: 'UNKNOWN' }] }),
    )
    expect(result.paymentMethods![0].type).toBe('OTHER')
  })

  it('passes raw object as metadata', () => {
    const raw = makeVendor()
    expect(transformVendor(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformVendor(makeVendor()))).not.toThrow()
  })
})
