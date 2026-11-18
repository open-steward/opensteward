import { describe, it, expect } from 'vitest'
import {
  transformOrganisation,
  type MossOrganisation,
} from '../../../../../../../src/verticals/accounting/adapters/moss/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<MossOrganisation> = {}): MossOrganisation {
  return {
    id: 'org-001',
    name: 'Acme Corp',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganisation (moss)', () => {
  it('maps id', () => {
    expect(transformOrganisation(makeRaw()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganisation(makeRaw()).name).toBe('Acme Corp')
  })

  it('maps currency', () => {
    expect(transformOrganisation(makeRaw()).currency).toBe('EUR')
  })

  it('passes raw as metadata', () => {
    const raw = makeRaw()
    expect(transformOrganisation(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    expect(() => OrganizationSchema.parse(transformOrganisation(makeRaw()))).not.toThrow()
  })
})
