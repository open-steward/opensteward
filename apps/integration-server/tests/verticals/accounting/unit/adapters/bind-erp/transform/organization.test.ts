import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type BindUserProfile,
} from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/organization'

function makeProfile(overrides: Partial<BindUserProfile> = {}): BindUserProfile {
  return {
    ID: 'user-1',
    Name: 'Jane Doe',
    Email: 'jane@example.com',
    RFC: 'DOE010101ABC',
    CompanyName: 'Acme SA de CV',
    CompanyRFC: 'ACM020202XYZ',
    LocationID: 'loc-1',
    LocationName: 'Main Branch',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('prefers ID over LocationID for id', () => {
    expect(transformOrganization(makeProfile()).id).toBe('user-1')
  })

  it('falls back to LocationID when ID is absent', () => {
    expect(transformOrganization(makeProfile({ ID: undefined })).id).toBe('loc-1')
  })

  it('returns undefined id when both ID and LocationID are absent', () => {
    expect(
      transformOrganization(makeProfile({ ID: undefined, LocationID: undefined })).id,
    ).toBeUndefined()
  })

  it('prefers CompanyName over LocationName over Name for name', () => {
    expect(transformOrganization(makeProfile()).name).toBe('Acme SA de CV')
  })

  it('falls back to LocationName when CompanyName is absent', () => {
    expect(transformOrganization(makeProfile({ CompanyName: undefined })).name).toBe('Main Branch')
  })

  it('falls back to Name when both CompanyName and LocationName are absent', () => {
    expect(
      transformOrganization(makeProfile({ CompanyName: undefined, LocationName: undefined })).name,
    ).toBe('Jane Doe')
  })

  it('maps CompanyName to legalName', () => {
    expect(transformOrganization(makeProfile()).legalName).toBe('Acme SA de CV')
  })

  it('legalName is undefined when CompanyName is absent', () => {
    expect(transformOrganization(makeProfile({ CompanyName: undefined })).legalName).toBeUndefined()
  })

  it('prefers CompanyRFC over RFC for taxNumber', () => {
    expect(transformOrganization(makeProfile()).taxNumber).toBe('ACM020202XYZ')
  })

  it('falls back to RFC when CompanyRFC is absent', () => {
    expect(transformOrganization(makeProfile({ CompanyRFC: undefined })).taxNumber).toBe(
      'DOE010101ABC',
    )
  })

  it('taxNumber is undefined when both CompanyRFC and RFC are absent', () => {
    expect(
      transformOrganization(makeProfile({ CompanyRFC: undefined, RFC: undefined })).taxNumber,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeProfile()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeProfile())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
