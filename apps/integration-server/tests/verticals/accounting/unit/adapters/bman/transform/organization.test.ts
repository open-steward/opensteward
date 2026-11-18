import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type BmanAzienda } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/organization'

function makeOrg(overrides: Partial<BmanAzienda> = {}): BmanAzienda {
  return {
    ragione_sociale: 'My Company', partita_iva: 'IT09876543210', indirizzo: 'Via Roma 1', citta: 'Roma', cap: '00100', provincia: 'RM', paese: 'IT', email: 'info@mc.it', telefono: '+39', sito_web: 'https://mc.it', valuta: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (bman)', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('My Company')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address).toBeDefined()
    expect(result.address?.city).toBe('Roma')
  })

  it('passes raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
