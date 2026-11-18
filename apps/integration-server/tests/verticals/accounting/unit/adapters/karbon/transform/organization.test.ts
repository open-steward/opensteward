import { describe, it, expect } from 'vitest'
import {
  transformClientGroupOrganization,
  type KarbonClientGroup,
} from '../../../../../../../src/verticals/accounting/adapters/karbon/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeClientGroup(overrides: Partial<KarbonClientGroup> = {}): KarbonClientGroup {
  return {
    ClientGroupKey: 'cg-001',
    FullName: 'Acme Group',
    UserDefinedIdentifier: 'acme-group',
    LastModifiedDateTime: '2024-06-01T12:00:00.000Z',
    BusinessCard: {
      WebSites: ['https://www.acme.example'],
      EmailAddresses: ['group@acme.example'],
      Addresses: [
        {
          AddressLines: '10 Group Plaza',
          City: 'Chicago',
          StateProvinceCounty: 'IL',
          ZipCode: '60601',
          CountryCode: 'US',
        },
      ],
    },
    ...overrides,
  }
}

describe('transformClientGroupOrganization', () => {
  it('maps ClientGroupKey to id', () => {
    expect(transformClientGroupOrganization(makeClientGroup()).id).toBe('cg-001')
  })

  it('maps FullName to both name and legalName', () => {
    const o = transformClientGroupOrganization(makeClientGroup())
    expect(o.name).toBe('Acme Group')
    expect(o.legalName).toBe('Acme Group')
  })

  it('maps UserDefinedIdentifier to organizationCode', () => {
    expect(transformClientGroupOrganization(makeClientGroup()).organizationCode).toBe('acme-group')
  })

  it('maps first BusinessCard.WebSites entry to website', () => {
    expect(transformClientGroupOrganization(makeClientGroup()).website).toBe(
      'https://www.acme.example',
    )
  })

  it('sets website to undefined when WebSites is absent', () => {
    const o = transformClientGroupOrganization(
      makeClientGroup({
        BusinessCard: { WebSites: undefined },
      }),
    )
    expect(o.website).toBeUndefined()
  })

  it('maps BusinessCard.Addresses[0] to address', () => {
    const o = transformClientGroupOrganization(makeClientGroup())
    expect(o.address?.address1).toBe('10 Group Plaza')
    expect(o.address?.city).toBe('Chicago')
    expect(o.address?.region).toBe('IL')
    expect(o.address?.postalCode).toBe('60601')
    expect(o.address?.country).toBe('US')
  })

  it('sets address to undefined when no BusinessCard Addresses', () => {
    const o = transformClientGroupOrganization(
      makeClientGroup({
        BusinessCard: { Addresses: [] },
      }),
    )
    expect(o.address).toBeUndefined()
  })

  it('sets address to undefined when BusinessCard is absent', () => {
    const o = transformClientGroupOrganization(makeClientGroup({ BusinessCard: undefined }))
    expect(o.address).toBeUndefined()
  })

  it('parses LastModifiedDateTime to a Date for updatedAt', () => {
    const o = transformClientGroupOrganization(makeClientGroup())
    expect(o.updatedAt).toBeInstanceOf(Date)
    expect(o.updatedAt?.toISOString()).toBe('2024-06-01T12:00:00.000Z')
  })

  it('sets updatedAt to undefined when LastModifiedDateTime is absent', () => {
    const o = transformClientGroupOrganization(makeClientGroup({ LastModifiedDateTime: undefined }))
    expect(o.updatedAt).toBeUndefined()
  })

  it('passes the raw object as metadata', () => {
    const raw = makeClientGroup()
    expect(transformClientGroupOrganization(raw).metadata).toBe(raw)
  })

  it('sets name and legalName to undefined when FullName is absent', () => {
    const o = transformClientGroupOrganization(makeClientGroup({ FullName: undefined }))
    expect(o.name).toBeUndefined()
    expect(o.legalName).toBeUndefined()
  })

  it('sets organizationCode to undefined when UserDefinedIdentifier is absent', () => {
    const o = transformClientGroupOrganization(
      makeClientGroup({ UserDefinedIdentifier: undefined }),
    )
    expect(o.organizationCode).toBeUndefined()
  })

  it('produces a schema-valid result', () => {
    expect(() =>
      OrganizationSchema.parse(transformClientGroupOrganization(makeClientGroup())),
    ).not.toThrow()
  })

  it('produces a schema-valid result with minimal input', () => {
    const minimal: KarbonClientGroup = { ClientGroupKey: 'cg-min' }
    expect(() => OrganizationSchema.parse(transformClientGroupOrganization(minimal))).not.toThrow()
  })
})
