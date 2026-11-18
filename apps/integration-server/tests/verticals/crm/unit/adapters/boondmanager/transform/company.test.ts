import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawBoondManagerCompany,
} from '../../../../../../../src/verticals/crm/adapters/boondmanager/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(
  attribs: Partial<RawBoondManagerCompany['attributes']> = {},
  rels: RawBoondManagerCompany['relationships'] = {},
): RawBoondManagerCompany {
  return {
    id: 'co-1',
    type: 'company',
    attributes: { ...attribs },
    relationships: rels,
  }
}

describe('boondmanager transformCompany', () => {
  it('maps id to string', () => {
    const raw: RawBoondManagerCompany = {
      id: '42',
      type: 'company',
      attributes: {},
    }
    expect(transformCompany(raw).id).toBe('42')
  })

  it('maps name from attributes', () => {
    expect(transformCompany(makeRaw({ name: 'Acme France' })).name).toBe('Acme France')
  })

  it('maps phone1 to phone', () => {
    expect(transformCompany(makeRaw({ phone1: '+33123456789' })).phone).toBe('+33123456789')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'acme.fr' })).domain).toBe('acme.fr')
  })

  it('maps mainManager relationship to owner_id', () => {
    const result = transformCompany(
      makeRaw({}, { mainManager: { data: { id: 'u-7', type: 'staff' } } }),
    )
    expect(result.owner_id).toBe('u-7')
  })

  it('converts creationDate to created_at', () => {
    const result = transformCompany(makeRaw({ creationDate: '2026-01-15T09:30:00Z' }))
    expect(result.created_at).toMatch(/2026-01-15/)
  })

  it('converts updateDate to updated_at', () => {
    const result = transformCompany(makeRaw({ updateDate: '2026-02-01T14:20:00Z' }))
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes CompanySchema.parse without throwing', () => {
    const raw = makeRaw(
      {
        name: 'Acme France',
        phone1: '+33123456789',
        website: 'acme.fr',
        creationDate: '2026-01-15T09:30:00Z',
        updateDate: '2026-02-01T14:20:00Z',
      },
      { mainManager: { data: { id: 'u-7', type: 'staff' } } },
    )
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('boondmanager untransformCompany', () => {
  it('maps name back', () => {
    expect(untransformCompany({ name: 'Acme France' })['name']).toBe('Acme France')
  })

  it('maps phone back to phone1', () => {
    expect(untransformCompany({ phone: '+33123456789' })['phone1']).toBe('+33123456789')
  })

  it('maps domain back to website', () => {
    expect(untransformCompany({ domain: 'acme.fr' })['website']).toBe('acme.fr')
  })

  it('round-trips name, phone, domain', () => {
    const raw = makeRaw({
      name: 'Round Trip SAS',
      phone1: '+33999888777',
      website: 'roundtrip.fr',
    })
    const canonical = transformCompany(raw)
    const back = untransformCompany(canonical)
    expect(back['name']).toBe('Round Trip SAS')
    expect(back['phone1']).toBe('+33999888777')
    expect(back['website']).toBe('roundtrip.fr')
  })
})
