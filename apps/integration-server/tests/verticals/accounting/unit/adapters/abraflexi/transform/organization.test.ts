import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AbraflexiOrganization } from '../../../../../../../src/verticals/accounting/adapters/abraflexi/transform/organization'

function makeOrganization(overrides: Partial<AbraflexiOrganization> = {}): AbraflexiOrganization {
  return {
    id: '1',
    nazev: 'Demo firma s.r.o.',
    pravniForma: 'Společnost s ručením omezeným',
    ic: '27074358',
    mena: 'CZK',
    email: 'demo@firma.cz',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id to string', () => {
    expect(transformOrganization(makeOrganization({ id: 7 })).id).toBe('7')
  })

  it('maps name from nazev', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Demo firma s.r.o.')
  })

  it('maps legalName from pravniForma', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Společnost s ručením omezeným')
  })

  it('maps taxNumber from ic', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('27074358')
  })

  it('maps currency from mena', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('CZK')
  })

  it('returns undefined name when nazev is missing', () => {
    expect(transformOrganization(makeOrganization({ nazev: undefined })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when ic is missing', () => {
    expect(transformOrganization(makeOrganization({ ic: undefined })).taxNumber).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization({ id: 7 }))
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
