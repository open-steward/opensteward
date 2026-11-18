import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type EcountOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/organization'

function makeOrganization(overrides: Partial<EcountOrganization> = {}): EcountOrganization {
  return {
    COM_CODE: 'ECOUNT01',
    COM_NAME: 'Ecount Inc',
    OWNER_NAME: 'John Doe',
    TEL: '02-1234-5678',
    FAX: '02-8765-4321',
    E_MAIL: 'info@ecount.com',
    ADDR: '123 Teheran-ro, Gangnam-gu',
    POSTAL_CODE: '06130',
    COUNTRY: 'KR',
    CRNC_CODE: 'KRW',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps COM_NAME to name and legalName', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Ecount Inc')
    expect(result.legalName).toBe('Ecount Inc')
  })

  it('maps CRNC_CODE to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('KRW')
  })

  it('maps ADDR to address.address1', () => {
    expect(transformOrganization(makeOrganization()).address?.address1).toBe('123 Teheran-ro, Gangnam-gu')
  })

  it('maps POSTAL_CODE to address.postalCode', () => {
    expect(transformOrganization(makeOrganization()).address?.postalCode).toBe('06130')
  })

  it('maps COUNTRY to address.country', () => {
    expect(transformOrganization(makeOrganization()).address?.country).toBe('KR')
  })

  it('returns undefined name when COM_NAME is absent', () => {
    const result = transformOrganization(makeOrganization({ COM_NAME: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
