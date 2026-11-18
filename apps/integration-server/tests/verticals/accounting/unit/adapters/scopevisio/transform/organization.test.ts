import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type ScopevisioAccountingInfo,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<ScopevisioAccountingInfo> = {}): ScopevisioAccountingInfo {
  return {
    customer: {
      publicId: 'acme-gmbh',
      name: 'Acme GmbH (Customer)',
      status: 'ACTIVE',
    },
    organisation: {
      id: 1234,
      name: 'Acme GmbH',
      teamworkTenantId: 'tw-123',
      teamworkTenantName: 'Acme',
    },
    ...overrides,
  }
}

describe('transformOrganization (scopevisio)', () => {
  it('maps organisation.id to id string', () => {
    expect(transformOrganization(makeRaw()).id).toBe('1234')
  })

  it('maps organisation.name to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Acme GmbH')
  })

  it('maps organisation.name to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Acme GmbH')
  })

  it('maps customer.publicId to organizationCode', () => {
    expect(transformOrganization(makeRaw()).organizationCode).toBe('acme-gmbh')
  })

  it('falls back to customer.name when organisation.name is absent', () => {
    const result = transformOrganization(makeRaw({ organisation: { id: 99 } }))
    expect(result.name).toBe('Acme GmbH (Customer)')
  })

  it('passes raw object as metadata', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
