import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawReplyIoAccount,
} from '../../../../../../../src/verticals/crm/adapters/reply-io/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawReplyIoAccount> = {}): RawReplyIoAccount {
  return {
    id: 7,
    name: 'Acme Corp',
    domainName: 'acme.example',
    phone: '+14155550123',
    industry: 'Manufacturing',
    ownerUserId: 55,
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    createdDate: '2026-01-15T09:30:00.000Z',
    ...overrides,
  }
}

describe('reply-io transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Corp')
  })

  it('maps domain from domainName', () => {
    expect(transformCompany(makeRaw()).domain).toBe('acme.example')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps industry', () => {
    expect(transformCompany(makeRaw()).industry).toBe('Manufacturing')
  })

  it('maps owner_id from ownerUserId', () => {
    expect(transformCompany(makeRaw()).owner_id).toBe('55')
  })

  it('maps address.city', () => {
    expect(transformCompany(makeRaw()).address?.city).toBe('San Francisco')
  })

  it('maps address.region from state', () => {
    expect(transformCompany(makeRaw()).address?.region).toBe('CA')
  })

  it('maps address.country', () => {
    expect(transformCompany(makeRaw()).address?.country).toBe('US')
  })

  it('sets address to undefined when city/state/country all absent', () => {
    const result = transformCompany(makeRaw({ city: null, state: null, country: null }))
    expect(result.address).toBeUndefined()
  })

  it('maps created_at from createdDate', () => {
    expect(transformCompany(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('always returns undefined for updated_at', () => {
    // The transform explicitly sets updated_at: undefined
    expect(transformCompany(makeRaw()).updated_at).toBeUndefined()
  })

  it('passes CompanySchema validation', () => {
    expect(() => CompanySchema.parse(transformCompany(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany round-trips name', () => {
    expect(untransformCompany({ name: 'New Corp' }).name).toBe('New Corp')
  })

  it('untransformCompany maps domain to domainName', () => {
    expect(untransformCompany({ domain: 'new.example' }).domainName).toBe('new.example')
  })

  it('untransformCompany converts owner_id to numeric ownerUserId', () => {
    expect(untransformCompany({ owner_id: '55' }).ownerUserId).toBe(55)
  })
})
