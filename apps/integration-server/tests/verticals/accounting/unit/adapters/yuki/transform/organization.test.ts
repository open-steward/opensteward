import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  organizationFromCredentials,
  type YukiAdministration,
} from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<YukiAdministration> = {}): YukiAdministration {
  return {
    AdministrationID: 'ADM-001',
    Name: 'Acme BV',
    CoCNumber: '12345678',
    VATNumber: 'NL123456789B01',
    ...overrides,
  }
}

describe('transformOrganization (yuki)', () => {
  it('maps AdministrationID to id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('ADM-001')
  })

  it('maps Name to name and legalName', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('Acme BV')
    expect(result.legalName).toBe('Acme BV')
  })

  it('maps CoCNumber to organizationCode', () => {
    expect(transformOrganization(makeRaw()).organizationCode).toBe('12345678')
  })

  it('maps VATNumber to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('NL123456789B01')
  })

  it('produces a schema-valid Organization', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})

describe('organizationFromCredentials (yuki)', () => {
  it('sets id from administrationId', () => {
    expect(organizationFromCredentials('ADM-001').id).toBe('ADM-001')
  })

  it('includes administrationId in metadata', () => {
    expect(organizationFromCredentials('ADM-001').metadata).toEqual({ administrationId: 'ADM-001' })
  })

  it('produces a schema-valid Organization', () => {
    expect(() => OrganizationSchema.parse(organizationFromCredentials('ADM-001'))).not.toThrow()
  })
})
