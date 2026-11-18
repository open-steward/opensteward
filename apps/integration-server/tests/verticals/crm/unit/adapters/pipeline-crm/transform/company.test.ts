import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawPipelineCrmCompany,
} from '../../../../../../../src/verticals/crm/adapters/pipeline-crm/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawPipelineCrmCompany> = {}): RawPipelineCrmCompany {
  return {
    id: 'co-7',
    name: 'Acme Corp',
    website: 'acme.example',
    phone: '+14155550123',
    industry: 'Manufacturing',
    owner_id: 'usr-1',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('pipeline-crm transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('co-7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Corp')
  })

  it('maps domain from website', () => {
    expect(transformCompany(makeRaw()).domain).toBe('acme.example')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps industry', () => {
    expect(transformCompany(makeRaw()).industry).toBe('Manufacturing')
  })

  it('maps owner_id', () => {
    expect(transformCompany(makeRaw()).owner_id).toBe('usr-1')
  })

  it('maps created_at as ISO datetime', () => {
    expect(transformCompany(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updated_at as ISO datetime', () => {
    expect(transformCompany(makeRaw()).updated_at).toBe('2026-01-20T12:00:00.000Z')
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

  it('untransformCompany maps domain to website', () => {
    expect(untransformCompany({ domain: 'new.example' }).website).toBe('new.example')
  })
})
