import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/spotler-crm/transform/company'
import { ACCOUNT_RECORD, CREATED_ACCOUNT_RECORD } from '../fixtures'

describe('spotler-crm transformCompany', () => {
  it('maps the documented account record', () => {
    const company = CompanySchema.parse(transformCompany(ACCOUNT_RECORD))
    expect(company.id).toBe('95920978')
    expect(company.name).toBe('test')
    expect(company.owner_id).toBe('90505')
    expect(company.metadata).toEqual(ACCOUNT_RECORD)
  })

  it('omits null and empty documented fields instead of defaulting them', () => {
    const company = CompanySchema.parse(transformCompany(ACCOUNT_RECORD))
    expect(company.phone).toBeUndefined()
    expect(company.industry).toBeUndefined()
    expect(company.address).toBeUndefined()
    expect(company.created_at).toBeUndefined()
    expect(company.updated_at).toBeUndefined()
  })

  it('reads an empty documented string as absent', () => {
    const company = CompanySchema.parse(
      transformCompany({ ...ACCOUNT_RECORD, phone: '', sector: '' }),
    )
    expect(company.phone).toBeUndefined()
    expect(company.industry).toBeUndefined()
  })

  it('does not map a country name into the ISO country field', () => {
    const company = CompanySchema.parse(transformCompany(CREATED_ACCOUNT_RECORD))
    expect(company.address).toBeUndefined()
  })

  it('maps populated phone, sector and address fields', () => {
    const raw = {
      ...ACCOUNT_RECORD,
      phone: '+441234567890',
      sector: 'Design',
      addressline: '1 High Street',
      addresscity: 'Oxford',
      'addresscounty/state': 'Oxfordshire',
      'addresspostcode/zip': 'OX1 1AA',
    }
    const company = CompanySchema.parse(transformCompany(raw))
    expect(company.phone).toBe('+441234567890')
    expect(company.industry).toBe('Design')
    expect(company.address).toEqual({
      line1: '1 High Street',
      city: 'Oxford',
      region: 'Oxfordshire',
      postalCode: 'OX1 1AA',
    })
  })

  it('untransforms company data', () => {
    const out = untransformCompany({ name: 'Jones & Co', phone: '+449876543210' })
    expect(out.accountname).toBe('Jones & Co')
    expect(out.phone).toBe('+449876543210')
  })
})
