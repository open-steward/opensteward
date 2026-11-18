import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawVtigerCompany } from '../../../../../../../src/verticals/crm/adapters/vtiger/transform/company'

function makeRaw(overrides: Partial<RawVtigerCompany> = {}): RawVtigerCompany {
  return { id: 'VTACC1', accountname: 'Vtiger Corp', ...overrides }
}

describe('vtiger transformCompany', () => {
  it('maps id and accountname to name', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('VTACC1')
    expect(result.name).toBe('Vtiger Corp')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'https://vtiger.com' })).domain).toBe('https://vtiger.com')
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

describe('vtiger untransformCompany', () => {
  it('maps name to accountname', () => {
    expect(untransformCompany({ name: 'Vtiger Co' }).accountname).toBe('Vtiger Co')
  })
})
