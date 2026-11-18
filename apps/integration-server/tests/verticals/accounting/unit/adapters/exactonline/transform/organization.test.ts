import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ExactDivision } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/organization'

function makeDiv(overrides: Partial<ExactDivision> = {}): ExactDivision {
  return { HID: 12345, Description: 'Main Division', Country: 'NL', Currency: 'EUR', VATNumber: 'NL123', ...overrides }
}

describe('transformOrganization (exactonline)', () => {
  it('maps id from HID', () => {
    expect(transformOrganization(makeDiv()).id).toBe('12345')
  })
  it('maps name from Description', () => {
    expect(transformOrganization(makeDiv()).name).toBe('Main Division')
  })
  it('maps taxNumber', () => {
    expect(transformOrganization(makeDiv()).taxNumber).toBe('NL123')
  })
  it('maps currency', () => {
    expect(transformOrganization(makeDiv({ Currency: 'USD' })).currency).toBe('USD')
  })
  it('maps address country', () => {
    expect(transformOrganization(makeDiv()).address?.country).toBe('NL')
  })
  it('passes raw object as metadata', () => {
    const raw = makeDiv()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeDiv())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
