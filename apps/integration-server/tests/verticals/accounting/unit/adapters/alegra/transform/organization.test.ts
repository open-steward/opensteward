import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AlegraCompanyInfo } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/organization'

function makeCompanyInfo(overrides: Partial<AlegraCompanyInfo> = {}): AlegraCompanyInfo {
  return {
    id: 1,
    name: 'Empresa S.A.S.',
    identification: '900123456-1',
    address: 'Calle 10 #5-20',
    city: 'Bogotá',
    department: 'Cundinamarca',
    country: 'CO',
    email: 'info@empresa.co',
    phone: '601-1234567',
    website: 'https://empresa.co',
    currency: 'COP',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id to string', () => {
    expect(transformOrganization(makeCompanyInfo()).id).toBe('1')
  })

  it('maps name and legalName', () => {
    const o = transformOrganization(makeCompanyInfo())
    expect(o.name).toBe('Empresa S.A.S.')
    expect(o.legalName).toBe('Empresa S.A.S.')
  })

  it('maps identification to taxNumber', () => {
    expect(transformOrganization(makeCompanyInfo()).taxNumber).toBe('900123456-1')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeCompanyInfo()).currency).toBe('COP')
  })

  it('maps website', () => {
    expect(transformOrganization(makeCompanyInfo()).website).toBe('https://empresa.co')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeCompanyInfo())
    expect(o.address?.address1).toBe('Calle 10 #5-20')
    expect(o.address?.city).toBe('Bogotá')
    expect(o.address?.region).toBe('Cundinamarca')
    expect(o.address?.country).toBe('CO')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCompanyInfo()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
