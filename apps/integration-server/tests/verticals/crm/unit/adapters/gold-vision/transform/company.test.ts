import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawGoldVisionAccount,
} from '../../../../../../../src/verticals/crm/adapters/gold-vision/transform/company'

function makeRaw(overrides: Partial<RawGoldVisionAccount> = {}): RawGoldVisionAccount {
  return { id: 1, ...overrides }
}

describe('gold-vision transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('returns empty string id when absent', () => {
    expect(transformCompany(makeRaw({ id: undefined })).id).toBe('')
  })

  it('maps summary to name', () => {
    expect(transformCompany(makeRaw({ summary: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('returns empty string name when summary absent', () => {
    expect(transformCompany(makeRaw({ summary: undefined })).name).toBe('')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'acme.com' })).domain).toBe('acme.com')
  })

  it('returns undefined domain when absent', () => {
    expect(transformCompany(makeRaw({ website: undefined })).domain).toBeUndefined()
  })

  it('maps phone through', () => {
    expect(transformCompany(makeRaw({ phone: '555-1234' })).phone).toBe('555-1234')
  })

  it('returns undefined phone when absent', () => {
    expect(transformCompany(makeRaw({ phone: undefined })).phone).toBeUndefined()
  })

  it('maps plain string industry through', () => {
    expect(transformCompany(makeRaw({ industry: 'Software' })).industry).toBe('Software')
  })

  it('resolves object industry to its summary', () => {
    expect(transformCompany(makeRaw({ industry: { summary: 'Tech' } })).industry).toBe('Tech')
  })

  it('returns undefined industry when absent', () => {
    expect(transformCompany(makeRaw({ industry: undefined })).industry).toBeUndefined()
  })

  it('maps numeric numberOfEmployees to size', () => {
    expect(transformCompany(makeRaw({ numberOfEmployees: 50 })).size).toBe(50)
  })

  it('parses string numberOfEmployees to integer', () => {
    expect(transformCompany(makeRaw({ numberOfEmployees: '50' })).size).toBe(50)
  })

  it('returns undefined size when NaN string', () => {
    expect(transformCompany(makeRaw({ numberOfEmployees: 'many' })).size).toBeUndefined()
  })

  it('returns undefined size when absent', () => {
    expect(transformCompany(makeRaw({ numberOfEmployees: undefined })).size).toBeUndefined()
  })

  it('maps ownerId to owner_id string', () => {
    expect(transformCompany(makeRaw({ ownerId: 5 })).owner_id).toBe('5')
  })

  it('returns undefined owner_id when absent', () => {
    expect(transformCompany(makeRaw({ ownerId: undefined })).owner_id).toBeUndefined()
  })

  it('returns undefined tags', () => {
    expect(transformCompany(makeRaw()).tags).toBeUndefined()
  })

  it('returns undefined address', () => {
    expect(transformCompany(makeRaw()).address).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields without throwing', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 42 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('gold-vision untransformCompany', () => {
  it('maps name to summary', () => {
    expect(untransformCompany({ name: 'Acme Corp' })).toMatchObject({ summary: 'Acme Corp' })
  })

  it('maps domain to website', () => {
    expect(untransformCompany({ domain: 'acme.com' })).toMatchObject({ website: 'acme.com' })
  })

  it('maps phone to phone', () => {
    expect(untransformCompany({ phone: '555-1234' })).toMatchObject({ phone: '555-1234' })
  })

  it('maps industry to industry', () => {
    expect(untransformCompany({ industry: 'Software' })).toMatchObject({ industry: 'Software' })
  })

  it('maps size to numberOfEmployees', () => {
    expect(untransformCompany({ size: 50 })).toMatchObject({ numberOfEmployees: 50 })
  })

  it('maps owner_id to ownerId', () => {
    expect(untransformCompany({ owner_id: '5' })).toMatchObject({ ownerId: '5' })
  })

  it('omits undefined fields', () => {
    const result = untransformCompany({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
