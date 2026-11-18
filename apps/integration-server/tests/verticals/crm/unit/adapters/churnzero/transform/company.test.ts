import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawChurnZeroAccount,
} from '../../../../../../../src/verticals/crm/adapters/churnzero/transform/company'

function makeRaw(overrides: Partial<RawChurnZeroAccount> = {}): RawChurnZeroAccount {
  return { ...overrides }
}

describe('churnzero transformCompany', () => {
  it('maps numeric Id to string', () => {
    expect(transformCompany(makeRaw({ Id: 7 })).id).toBe('7')
  })

  it('maps string Id to string', () => {
    expect(transformCompany(makeRaw({ Id: 'ACC-1' })).id).toBe('ACC-1')
  })

  it('falls back to ExternalId when Id is absent', () => {
    expect(transformCompany(makeRaw({ ExternalId: 'EXT-ACC' })).id).toBe('EXT-ACC')
  })

  it('returns empty string when Id and ExternalId are both absent', () => {
    expect(transformCompany(makeRaw()).id).toBe('')
  })

  it('maps Name', () => {
    expect(transformCompany(makeRaw({ Name: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('defaults name to empty string when Name is absent', () => {
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('maps Tags when present and non-empty', () => {
    expect(transformCompany(makeRaw({ Tags: ['enterprise'] })).tags).toEqual(['enterprise'])
  })

  it('omits tags when Tags is an empty array', () => {
    expect(transformCompany(makeRaw({ Tags: [] })).tags).toBeUndefined()
  })

  it('maps ObjectCreatedDate to created_at', () => {
    expect(transformCompany(makeRaw({ ObjectCreatedDate: '2023-03-01T00:00:00Z' })).created_at).toBe('2023-03-01T00:00:00Z')
  })

  it('maps ObjectLastModifiedDate to updated_at', () => {
    expect(transformCompany(makeRaw({ ObjectLastModifiedDate: '2024-05-15T00:00:00Z' })).updated_at).toBe('2024-05-15T00:00:00Z')
  })

  it('populates address when BillingAddressLine1 is present', () => {
    const result = transformCompany(makeRaw({
      BillingAddressLine1: '123 Main St',
      BillingAddressCity: 'Springfield',
      BillingAddressState: 'IL',
      BillingAddressCountry: 'US',
      BillingAddressZip: '62701',
    }))
    expect(result.address).toEqual({
      line1: '123 Main St',
      line2: undefined,
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    })
  })

  it('populates address when only BillingAddressCity is present', () => {
    const result = transformCompany(makeRaw({ BillingAddressCity: 'Portland' }))
    expect(result.address?.city).toBe('Portland')
  })

  it('maps BillingAddressLine2 into address.line2', () => {
    const result = transformCompany(makeRaw({
      BillingAddressLine1: '1 Tower Rd',
      BillingAddressLine2: 'Suite 200',
    }))
    expect(result.address?.line2).toBe('Suite 200')
  })

  it('omits address when no billing address fields are present', () => {
    expect(transformCompany(makeRaw({ Name: 'Empty' })).address).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw({ Id: 'A1' })
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ Id: 7 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('churnzero untransformCompany', () => {
  it('maps name to Name', () => {
    expect(untransformCompany({ name: 'Acme' }).Name).toBe('Acme')
  })

  it('maps address.line1 to BillingAddressLine1', () => {
    expect(untransformCompany({ address: { line1: '1 Main St' } }).BillingAddressLine1).toBe('1 Main St')
  })

  it('maps address.line2 to BillingAddressLine2', () => {
    expect(untransformCompany({ address: { line1: '1 Main St', line2: 'Apt 4' } }).BillingAddressLine2).toBe('Apt 4')
  })

  it('maps address.city to BillingAddressCity', () => {
    expect(untransformCompany({ address: { city: 'Austin' } }).BillingAddressCity).toBe('Austin')
  })

  it('maps address.region to BillingAddressState', () => {
    expect(untransformCompany({ address: { region: 'TX' } }).BillingAddressState).toBe('TX')
  })

  it('maps address.country to BillingAddressCountry', () => {
    expect(untransformCompany({ address: { country: 'US' } }).BillingAddressCountry).toBe('US')
  })

  it('maps address.postalCode to BillingAddressZip', () => {
    expect(untransformCompany({ address: { postalCode: '78701' } }).BillingAddressZip).toBe('78701')
  })

  it('omits keys not present in the input', () => {
    const out = untransformCompany({ name: 'Acme' })
    expect(out).not.toHaveProperty('BillingAddressLine1')
  })
})
