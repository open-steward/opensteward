import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FlowAccountOrganization } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/organization'

function makeOrganization(overrides: Partial<FlowAccountOrganization> = {}): FlowAccountOrganization {
  return {
    id: 500,
    businessName: 'My Business Thailand Co., Ltd.',
    taxId: '0105564000001',
    address: '888 Silom Rd, Bangkok',
    email: 'info@mybiz.co.th',
    phone: '+66 2 333 4444',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('My Business Thailand Co., Ltd.')
    expect(result.taxNumber).toBe('0105564000001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps address field', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('888 Silom Rd, Bangkok')
  })

  it('returns undefined address when address is empty', () => {
    const result = transformOrganization(makeOrganization({ address: '' }))
    expect(result.address).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
