import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type Bill4TimeFirm,
} from '../../../../../../../src/verticals/accounting/adapters/bill4time/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<Bill4TimeFirm> = {}): Bill4TimeFirm {
  return {
    FirmId: 'FIRM-001',
    FirmName: 'Smith & Associates Law Firm',
    Address: '200 Legal Ave',
    Address2: 'Suite 400',
    City: 'Houston',
    State: 'TX',
    Zip: '77002',
    Country: 'US',
    Phone: '+17131234567',
    Email: 'info@smithlaw.com',
    Website: 'https://www.smithlaw.com',
    Currency: 'USD',
    TimeZone: 'America/Chicago',
    ...overrides,
  }
}

describe('transformOrganization (bill4time)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('FIRM-001')
    expect(result.name).toBe('Smith & Associates Law Firm')
    expect(result.legalName).toBe('Smith & Associates Law Firm')
    expect(result.currency).toBe('USD')
    expect(result.timezone).toBe('America/Chicago')
    expect(result.website).toBe('https://www.smithlaw.com')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('200 Legal Ave')
    expect(result.address?.address2).toBe('Suite 400')
    expect(result.address?.city).toBe('Houston')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.postalCode).toBe('77002')
    expect(result.address?.country).toBe('US')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
