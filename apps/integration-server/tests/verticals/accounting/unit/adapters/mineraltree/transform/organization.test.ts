import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type MtCompany,
} from '../../../../../../../src/verticals/accounting/adapters/mineraltree/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeCompany(overrides: Partial<MtCompany> = {}): MtCompany {
  return {
    id: 'mt_co_001',
    name: 'MineralTree Demo Corp',
    externalId: 'EXT-CO-1',
    taxId: 'US-9876543210',
    address: {
      address1: '50 State St',
      address2: 'Floor 3',
      town: 'Boston',
      postalCode: '02109',
      ctrySubDivision: 'MA',
      country: 'USA',
    },
    ...overrides,
  }
}

describe('transformOrganization (mineraltree)', () => {
  it('maps id', () => {
    expect(transformOrganization(makeCompany()).id).toBe('mt_co_001')
  })

  it('maps name to both name and legalName', () => {
    const result = transformOrganization(makeCompany())
    expect(result.name).toBe('MineralTree Demo Corp')
    expect(result.legalName).toBe('MineralTree Demo Corp')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformOrganization(makeCompany()).taxNumber).toBe('US-9876543210')
  })

  it('falls back to externalId for taxNumber when taxId is absent', () => {
    const result = transformOrganization(makeCompany({ taxId: undefined }))
    expect(result.taxNumber).toBe('EXT-CO-1')
  })

  it('maps address fields (truncates 3-letter ISO country to 2 chars)', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('50 State St')
    expect(result.address?.address2).toBe('Floor 3')
    expect(result.address?.city).toBe('Boston')
    expect(result.address?.postalCode).toBe('02109')
    expect(result.address?.region).toBe('MA')
    // 'USA' → slice(0,2) → 'US'
    expect(result.address?.country).toBe('US')
  })

  it('returns undefined address when address is absent', () => {
    const result = transformOrganization(makeCompany({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeCompany()))).not.toThrow()
  })
})
