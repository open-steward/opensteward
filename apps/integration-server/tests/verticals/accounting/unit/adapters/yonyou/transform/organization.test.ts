import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type YonyouOrganization } from '../../../../../../../src/verticals/accounting/adapters/yonyou/transform/organization'

function makeOrganization(overrides: Partial<YonyouOrganization> = {}): YonyouOrganization {
  return {
    id: 'org-1',
    name: 'My Company Ltd',
    taxpayernum: '91110000123456789X',
    ...overrides,
  }
}

describe('transformOrganization (yonyou)', () => {
  it('maps id field', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-1')
  })

  it('maps name field', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('My Company Ltd')
  })

  it('maps taxNumber from taxpayernum', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('91110000123456789X')
  })

  it('metadata identity', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
