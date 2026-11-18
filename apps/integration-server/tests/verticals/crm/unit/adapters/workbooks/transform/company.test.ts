import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawWorkbooksOrganisation,
} from '../../../../../../../src/verticals/crm/adapters/workbooks/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawWorkbooksOrganisation> = {}): RawWorkbooksOrganisation {
  return { id: 'org-1', ...overrides }
}

describe('workbooks transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 42 })).id).toBe('42')
    expect(transformCompany(makeRaw({ id: 'org-99' })).id).toBe('org-99')
  })

  it('maps name field', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Industries' })).name).toBe('Acme Industries')
  })

  it('defaults name to empty string when absent', () => {
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('maps industry field', () => {
    expect(transformCompany(makeRaw({ industry: 'Manufacturing' })).industry).toBe('Manufacturing')
  })

  it('sets industry to undefined when absent', () => {
    expect(transformCompany(makeRaw()).industry).toBeUndefined()
  })

  it('maps main_location[telephone] to phone', () => {
    const result = transformCompany(makeRaw({ 'main_location[telephone]': '+14155550123' }))
    expect(result.phone).toBe('+14155550123')
  })

  it('maps main_location[website] to domain', () => {
    const result = transformCompany(makeRaw({ 'main_location[website]': 'acme.example' }))
    expect(result.domain).toBe('acme.example')
  })

  it('maps assigned_to_id to owner_id as string', () => {
    expect(transformCompany(makeRaw({ assigned_to_id: 7 })).owner_id).toBe('7')
    expect(transformCompany(makeRaw({ assigned_to_id: 'u-5' })).owner_id).toBe('u-5')
  })

  it('sets owner_id to undefined when assigned_to_id is absent', () => {
    expect(transformCompany(makeRaw()).owner_id).toBeUndefined()
  })

  it('maps created_at and updated_at', () => {
    const result = transformCompany(
      makeRaw({
        created_at: '2026-01-15T09:30:00.000Z',
        updated_at: '2026-02-01T14:20:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('includes raw object in metadata', () => {
    const raw = makeRaw({ name: 'Acme' })
    const result = transformCompany(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CompanySchema.parse without throwing', () => {
    const raw = makeRaw({
      name: 'Acme Industries',
      industry: 'Manufacturing',
      'main_location[telephone]': '+14155550123',
      'main_location[website]': 'acme.example',
      assigned_to_id: 'u-1',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('workbooks untransformCompany', () => {
  it('maps name back', () => {
    expect(untransformCompany({ name: 'Acme' }).name).toBe('Acme')
  })

  it('maps industry back', () => {
    expect(untransformCompany({ industry: 'Tech' }).industry).toBe('Tech')
  })

  it('maps phone back to main_location[telephone]', () => {
    expect(untransformCompany({ phone: '+14155550123' })['main_location[telephone]']).toBe(
      '+14155550123',
    )
  })

  it('maps domain back to main_location[website]', () => {
    expect(untransformCompany({ domain: 'acme.example' })['main_location[website]']).toBe(
      'acme.example',
    )
  })

  it('omits fields not provided', () => {
    const result = untransformCompany({})
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('industry')
    expect(result).not.toHaveProperty('main_location[telephone]')
    expect(result).not.toHaveProperty('main_location[website]')
  })

  it('round-trips name, phone, and domain', () => {
    const raw = makeRaw({
      name: 'Round-trip Corp',
      'main_location[telephone]': '+442012345678',
      'main_location[website]': 'roundtrip.example',
      industry: 'Retail',
    })
    const canonical = transformCompany(raw)
    const back = untransformCompany(canonical)
    expect(back.name).toBe('Round-trip Corp')
    expect(back['main_location[telephone]']).toBe('+442012345678')
    expect(back['main_location[website]']).toBe('roundtrip.example')
    expect(back.industry).toBe('Retail')
  })
})
