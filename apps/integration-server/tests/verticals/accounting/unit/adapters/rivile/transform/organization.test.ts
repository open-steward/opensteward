import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type RivileOrganization } from '../../../../../../../src/verticals/accounting/adapters/rivile/transform/organization'

function makeOrg(overrides: Partial<RivileOrganization> = {}): RivileOrganization {
  return {
    id: '1',
    name: 'UAB Rivile Systems',
    pvm_kodas: 'LT100002345678',
    ...overrides,
  }
}

describe('transformOrganization (rivile)', () => {
  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('UAB Rivile Systems')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('UAB Rivile Systems')
  })

  it('maps pvm_kodas to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('LT100002345678')
  })

  it('handles missing pvm_kodas', () => {
    expect(transformOrganization(makeOrg({ pvm_kodas: undefined })).taxNumber).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
