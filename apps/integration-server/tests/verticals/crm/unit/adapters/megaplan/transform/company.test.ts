import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawMegaplanCompany,
} from '../../../../../../../src/verticals/crm/adapters/megaplan/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawMegaplanCompany> = {}): RawMegaplanCompany {
  return { id: '1', name: 'Acme Corp', ...overrides }
}

describe('megaplan transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'GlobalTech' })).name).toBe('GlobalTech')
  })

  it('maps site to domain', () => {
    expect(transformCompany(makeRaw({ site: 'globaltech.ru' })).domain).toBe('globaltech.ru')
  })

  it('extracts phone from object-style phones array', () => {
    const raw = makeRaw({ phones: [{ number: '+74951234567', type: 'work' }] })
    expect(transformCompany(raw).phone).toBe('+74951234567')
  })

  it('extracts phone from string-style phones array', () => {
    const raw = makeRaw({ phones: ['+74951234567'] })
    expect(transformCompany(raw).phone).toBe('+74951234567')
  })

  it('returns undefined phone when phones is empty', () => {
    expect(transformCompany(makeRaw({ phones: [] })).phone).toBeUndefined()
  })

  it('maps first responsible.id to owner_id as string', () => {
    const raw = makeRaw({
      responsibles: [{ id: '3', contentType: 'Employee' }],
    })
    expect(transformCompany(raw).owner_id).toBe('3')
  })

  it('maps timeCreated to created_at', () => {
    const result = transformCompany(makeRaw({ timeCreated: '2024-05-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-05-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('passes CompanySchema validation', () => {
    const raw: RawMegaplanCompany = {
      id: '10',
      name: 'RusTech LLC',
      site: 'rustech.ru',
      phones: [{ number: '+74951234567', type: 'work' }],
      responsibles: [{ id: '3', contentType: 'Employee' }],
      timeCreated: '2024-01-01T00:00:00.000Z',
      timeUpdated: '2024-06-01T00:00:00.000Z',
    }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('megaplan untransformCompany', () => {
  it('sets contentType to Contractor', () => {
    expect(untransformCompany({}).contentType).toBe('Contractor')
  })

  it('maps name', () => {
    expect(untransformCompany({ name: 'GlobalTech' }).name).toBe('GlobalTech')
  })

  it('maps domain to site', () => {
    expect(untransformCompany({ domain: 'globaltech.ru' }).site).toBe('globaltech.ru')
  })

  it('maps phone to phones array with work type', () => {
    const result = untransformCompany({ phone: '+74951234567' })
    expect(result.phones).toEqual([{ number: '+74951234567', type: 'work' }])
  })

  it('maps owner_id to responsibles array', () => {
    const result = untransformCompany({ owner_id: '3' })
    expect(result.responsibles).toEqual([{ contentType: 'Employee', id: '3' }])
  })
})
