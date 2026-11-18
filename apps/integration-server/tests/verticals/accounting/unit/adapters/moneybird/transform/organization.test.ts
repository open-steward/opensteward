import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MoneybirdAdmin } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/organization'

function makeAdmin(overrides: Partial<MoneybirdAdmin> = {}): MoneybirdAdmin {
  return { id: 123, name: 'Mijn Bedrijf', currency: 'EUR', country: 'NL', time_zone: 'Europe/Amsterdam', ...overrides }
}

describe('transformOrganization (moneybird)', () => {
  it('maps id, name, currency', () => {
    const r = transformOrganization(makeAdmin())
    expect(r.id).toBe('123')
    expect(r.name).toBe('Mijn Bedrijf')
    expect(r.currency).toBe('EUR')
  })
  it('maps timezone', () => { expect(transformOrganization(makeAdmin()).timezone).toBe('Europe/Amsterdam') })
  it('maps country to address', () => { expect(transformOrganization(makeAdmin()).address?.country).toBe('NL') })
  it('passes raw as metadata', () => {
    const raw = makeAdmin()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeAdmin())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
