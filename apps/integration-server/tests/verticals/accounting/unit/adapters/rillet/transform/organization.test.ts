import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type RilletOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrganization(overrides: Partial<RilletOrganization> = {}): RilletOrganization {
  return {
    id: 'org_acme',
    currency: 'USD',
    timezone: 'America/Los_Angeles',
    trade_name: 'Acme Industries',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id directly', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org_acme')
  })

  it('maps trade_name to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Industries')
  })

  it('maps currency directly', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps timezone directly', () => {
    expect(transformOrganization(makeOrganization()).timezone).toBe('America/Los_Angeles')
  })

  it('yields undefined name when trade_name is empty string', () => {
    expect(transformOrganization(makeOrganization({ trade_name: '' })).name).toBeUndefined()
  })

  it('yields undefined currency when currency is empty string', () => {
    expect(transformOrganization(makeOrganization({ currency: '' })).currency).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces output that passes OrganizationSchema validation', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
