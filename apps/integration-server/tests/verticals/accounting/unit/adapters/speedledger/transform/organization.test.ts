import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type SpeedLedgerOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/speedledger/transform/organization'

function makeOrg(overrides: Partial<SpeedLedgerOrganization> = {}): SpeedLedgerOrganization {
  return {
    id: 1,
    name: 'SpeedLedger Demo AB',
    orgNumber: '556111-2222',
    vatNumber: 'SE556111222201',
    email: 'info@speedledger-demo.se',
    phone: '+46709991234',
    address: 'Hamngatan 3',
    city: 'Stockholm',
    postalCode: '111 47',
    country: 'SE',
    currency: 'SEK',
    ...overrides,
  }
}

describe('transformOrganization (SpeedLedger)', () => {
  it('maps name and legalName', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('SpeedLedger Demo AB')
    expect(result.legalName).toBe('SpeedLedger Demo AB')
  })

  it('maps orgNumber to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('556111-2222')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('SEK')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Hamngatan 3')
    expect(result.address?.city).toBe('Stockholm')
    expect(result.address?.postalCode).toBe('111 47')
    expect(result.address?.country).toBe('SE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrg()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
