import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ICountOrganization } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/organization'

function makeOrg(overrides: Partial<ICountOrganization> = {}): ICountOrganization {
  return {
    id: 'org_1',
    company_name: 'Israeli Co Ltd',
    tax_id: '123456789',
    email: 'contact@israelico.il',
    phone: '02-9998888',
    address: 'Ben Yehuda 10',
    city: 'Jerusalem',
    country: 'IL',
    ...overrides,
  }
}

describe('transformOrganization (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.id).toBe('org_1')
    expect(result.name).toBe('Israeli Co Ltd')
    expect(result.taxNumber).toBe('123456789')
  })

  it('maps address correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Ben Yehuda 10')
    expect(result.address?.city).toBe('Jerusalem')
    expect(result.address?.country).toBe('IL')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrg()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing address', () => {
    const result = transformOrganization(makeOrg({ address: undefined, city: undefined, country: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
