import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type PeakAccountOrganization } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/organization'

function makeOrganization(overrides: Partial<PeakAccountOrganization> = {}): PeakAccountOrganization {
  return {
    id: 'ORG-001',
    companyName: 'My Thai Business Co., Ltd.',
    taxId: '0105563012345',
    address: '100 Sathorn Rd, Bangkok',
    email: 'admin@mythaibiz.co.th',
    phone: '+66 2 111 2222',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('My Thai Business Co., Ltd.')
    expect(result.taxNumber).toBe('0105563012345')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps address field', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('100 Sathorn Rd, Bangkok')
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
