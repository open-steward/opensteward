import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawSugarAccount } from '../../../../../../../src/verticals/crm/adapters/sugarcrm/transform/company'

function makeRaw(overrides: Partial<RawSugarAccount> = {}): RawSugarAccount {
  return { id: 'SACC1', name: 'Sugar Corp', ...overrides }
}

describe('sugarcrm transformCompany', () => {
  it('maps id and name', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('SACC1')
    expect(result.name).toBe('Sugar Corp')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'https://sugar.com' })).domain).toBe('https://sugar.com')
  })

  it('maps phone_office to phone', () => {
    expect(transformCompany(makeRaw({ phone_office: '555-9999' })).phone).toBe('555-9999')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('sugarcrm untransformCompany', () => {
  it('maps phone to phone_office', () => {
    expect(untransformCompany({ phone: '555' }).phone_office).toBe('555')
  })
})
