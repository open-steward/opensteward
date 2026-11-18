import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/forcemanager/transform/company'
import { ACCOUNT, ACCOUNTS } from '../fixtures'

describe('forcemanager transformCompany (documented GET /accounts/{ID} example)', () => {
  const out = transformCompany(ACCOUNT)

  it('parses with the canonical schema', () => {
    expect(() => CompanySchema.parse(out)).not.toThrow()
    for (const row of ACCOUNTS)
      expect(() => CompanySchema.parse(transformCompany(row))).not.toThrow()
  })

  it('maps the documented fields', () => {
    expect(out).toMatchObject({
      id: '399',
      name: 'H-Farm s.p.a.',
      domain: 'www.h-farm.com',
      owner_id: '121',
      address: {
        line1: 'Via Sile, 41, 31056 Roncade TV, Italy',
        city: 'Roncade',
        region: 'Veneto',
        postalCode: '31056',
      },
      created_at: '2021-11-25T12:30:31.180Z',
      updated_at: '2021-11-30T13:08:05.450Z',
    })
    expect(out.phone).toBeUndefined()
    expect(out.address?.country).toBeUndefined()
  })

  it('reads phone and salesRepId1 from the list example', () => {
    const r = transformCompany(ACCOUNTS[0]!)
    expect(r.phone).toBe('643464946494')
    expect(r.owner_id).toBe('5548')
    expect(r.domain).toBeUndefined()
  })

  it('maps address2 to line2', () => {
    expect(transformCompany({ ...ACCOUNT, address2: 'Building B' }).address?.line2).toBe(
      'Building B',
    )
  })

  it('has no industry: the Account attributes document none', () => {
    expect(out.industry).toBeUndefined()
  })

  it('throws on an account with no id', () => {
    expect(() => transformCompany({ ...ACCOUNT, id: undefined })).toThrow(/no id/)
  })

  it('keeps the raw payload as metadata', () => {
    expect(out.metadata).toBe(ACCOUNT)
  })

  it('untransform (write path, unchanged) still maps the name', () => {
    expect(untransformCompany({ name: 'Acme' })).toEqual({ name: 'Acme' })
  })
})
