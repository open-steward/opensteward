import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type RoutableWorkspace,
} from '../../../../../../../src/verticals/accounting/adapters/routable/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeWorkspace(overrides: Partial<RoutableWorkspace> = {}): RoutableWorkspace {
  return {
    id: 'ws_abc123',
    name: 'Acme Industries',
    legal_name: 'Acme Industries, Inc.',
    email: 'finance@acme.example',
    timezone: 'America/Los_Angeles',
    address: {
      street_address: '500 Tech Blvd',
      street_address2: 'Floor 3',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeWorkspace()).id).toBe('ws_abc123')
  })

  it('maps name', () => {
    expect(transformOrganization(makeWorkspace()).name).toBe('Acme Industries')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeWorkspace()).legalName).toBe('Acme Industries, Inc.')
  })

  it('falls back to name when legal_name is absent', () => {
    const result = transformOrganization(makeWorkspace({ legal_name: undefined }))
    expect(result.legalName).toBe('Acme Industries')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeWorkspace()).timezone).toBe('America/Los_Angeles')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeWorkspace())
    expect(result.address?.address1).toBe('500 Tech Blvd')
    expect(result.address?.address2).toBe('Floor 3')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.postalCode).toBe('78701')
    expect(result.address?.country).toBe('US')
  })

  it('returns undefined address when address is absent', () => {
    const result = transformOrganization(makeWorkspace({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeWorkspace()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeWorkspace())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
