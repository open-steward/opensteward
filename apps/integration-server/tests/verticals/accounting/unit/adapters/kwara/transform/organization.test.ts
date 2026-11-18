import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type KwaraOrganisation,
} from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/organization'

function makeOrganisation(overrides: Partial<KwaraOrganisation> = {}): KwaraOrganisation {
  return {
    id: 'org-kwara-1',
    name: 'Kwara SACCO',
    currency: 'KES',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    const result = transformOrganization(makeOrganisation())
    expect(result.id).toBe('org-kwara-1')
  })

  it('maps name', () => {
    const result = transformOrganization(makeOrganisation())
    expect(result.name).toBe('Kwara SACCO')
  })

  it('maps currency', () => {
    const result = transformOrganization(makeOrganisation())
    expect(result.currency).toBe('KES')
  })

  it('sets name to undefined when missing', () => {
    const result = transformOrganization(makeOrganisation({ name: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrganisation()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganisation())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
