import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MyobCompanyFile } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/organization'

function makeOrg(overrides: Partial<MyobCompanyFile> = {}): MyobCompanyFile {
  return { Id: 'uid-1', Name: 'My Business', BaseCurrency: 'AUD', Country: 'AU', ...overrides }
}

describe('transformOrganization (myob)', () => {
  it('maps id, name, currency', () => {
    const r = transformOrganization(makeOrg())
    expect(r.id).toBe('uid-1')
    expect(r.name).toBe('My Business')
    expect(r.currency).toBe('AUD')
  })
  it('maps country to address', () => { expect(transformOrganization(makeOrg()).address?.country).toBe('AU') })
  it('passes raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
