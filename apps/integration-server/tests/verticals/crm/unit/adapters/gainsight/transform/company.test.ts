import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawGainsightCompany,
} from '../../../../../../../src/verticals/crm/adapters/gainsight/transform/company'

function makeRaw(overrides: Partial<RawGainsightCompany> = {}): RawGainsightCompany {
  return { Gsid: 'gs-1', Name: 'Acme Corp', ...overrides }
}

describe('gainsight transformCompany', () => {
  describe('id', () => {
    it('maps Gsid to string', () => {
      expect(transformCompany(makeRaw({ Gsid: 'gs-abc' })).id).toBe('gs-abc')
    })

    it('falls back to ExternalRecordID__gc when Gsid is absent', () => {
      expect(
        transformCompany(makeRaw({ Gsid: undefined, ExternalRecordID__gc: 'ext-99' })).id,
      ).toBe('ext-99')
    })

    it('falls back to Name when both Gsid and ExternalRecordID__gc are absent', () => {
      expect(
        transformCompany(
          makeRaw({ Gsid: undefined, ExternalRecordID__gc: undefined, Name: 'Fallback Co' }),
        ).id,
      ).toBe('Fallback Co')
    })

    it('is empty string when all id sources are absent', () => {
      expect(
        transformCompany({ Gsid: undefined, ExternalRecordID__gc: undefined, Name: undefined }).id,
      ).toBe('')
    })
  })

  describe('name', () => {
    it('maps Name', () => {
      expect(transformCompany(makeRaw({ Name: 'Big Corp' })).name).toBe('Big Corp')
    })

    it('is empty string when Name is absent', () => {
      expect(transformCompany(makeRaw({ Name: undefined })).name).toBe('')
    })
  })

  describe('industry', () => {
    it('maps Industry', () => {
      expect(transformCompany(makeRaw({ Industry: 'Software' })).industry).toBe('Software')
    })

    it('is undefined when Industry is absent', () => {
      expect(transformCompany(makeRaw({ Industry: undefined })).industry).toBeUndefined()
    })
  })

  describe('size', () => {
    it('maps Employees when it is a number', () => {
      expect(transformCompany(makeRaw({ Employees: 250 })).size).toBe(250)
    })

    it('is undefined when Employees is absent', () => {
      expect(transformCompany(makeRaw({ Employees: undefined })).size).toBeUndefined()
    })

    it('is undefined when Employees is a string (not a number type)', () => {
      expect(
        transformCompany(makeRaw({ Employees: '500' as unknown as number })).size,
      ).toBeUndefined()
    })
  })

  describe('phone', () => {
    it('maps Phone', () => {
      expect(transformCompany(makeRaw({ Phone: '+1-555-0100' })).phone).toBe('+1-555-0100')
    })

    it('is undefined when Phone is absent', () => {
      expect(transformCompany(makeRaw({ Phone: undefined })).phone).toBeUndefined()
    })
  })

  describe('created_at / updated_at', () => {
    it('maps CreatedDate', () => {
      const result = transformCompany(makeRaw({ CreatedDate: '2023-03-10T08:00:00Z' }))
      expect(result.created_at).toBeTruthy()
      expect(result.created_at).toContain('2023-03-10')
    })

    it('created_at is undefined when CreatedDate is absent', () => {
      expect(transformCompany(makeRaw({ CreatedDate: undefined })).created_at).toBeUndefined()
    })

    it('maps ModifiedDate', () => {
      const result = transformCompany(makeRaw({ ModifiedDate: '2023-07-22T15:30:00Z' }))
      expect(result.updated_at).toBeTruthy()
      expect(result.updated_at).toContain('2023-07-22')
    })

    it('updated_at is undefined when ModifiedDate is absent', () => {
      expect(transformCompany(makeRaw({ ModifiedDate: undefined })).updated_at).toBeUndefined()
    })
  })

  describe('metadata', () => {
    it('is the raw object by reference', () => {
      const raw = makeRaw()
      expect(transformCompany(raw).metadata).toBe(raw)
    })
  })

  describe('unmapped fields', () => {
    it('does not map domain', () => {
      expect(transformCompany(makeRaw()).domain).toBeUndefined()
    })

    it('does not map owner_id', () => {
      expect(transformCompany(makeRaw()).owner_id).toBeUndefined()
    })

    it('does not map tags', () => {
      expect(transformCompany(makeRaw()).tags).toBeUndefined()
    })

    it('does not map address', () => {
      expect(transformCompany(makeRaw()).address).toBeUndefined()
    })
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ Gsid: 'gs-abc' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('gainsight untransformCompany', () => {
  it('maps name to "Name"', () => {
    const result = untransformCompany({ name: 'Widgets Inc' })
    expect(result.Name).toBe('Widgets Inc')
  })

  it('maps industry to "Industry"', () => {
    const result = untransformCompany({ industry: 'Retail' })
    expect(result.Industry).toBe('Retail')
  })

  it('maps size to "Employees"', () => {
    const result = untransformCompany({ size: 1000 })
    expect(result.Employees).toBe(1000)
  })

  it('maps phone to "Phone"', () => {
    const result = untransformCompany({ phone: '+44-20-7946-0958' })
    expect(result.Phone).toBe('+44-20-7946-0958')
  })
})
