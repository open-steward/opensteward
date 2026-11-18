import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawCapsuleCompany } from '../../../../../../../src/verticals/crm/adapters/capsule/transform/company'

function makeRaw(overrides: Partial<RawCapsuleCompany> = {}): RawCapsuleCompany {
  return { id: 1, ...overrides }
}

describe('capsule transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme' })).name).toBe('Acme')
  })

  it('maps phone from phoneNumbers', () => {
    const result = transformCompany(makeRaw({ phoneNumbers: [{ number: '123' }] }))
    expect(result.phone).toBe('123')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps phone to phoneNumbers array', () => {
    const result = untransformCompany({ phone: '555' })
    expect((result.phoneNumbers as Array<{ number: string }>)[0].number).toBe('555')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 5 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
