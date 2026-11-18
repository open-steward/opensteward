import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SilaEntity } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/organization'

function makeRaw(overrides: Partial<SilaEntity> = {}): SilaEntity {
  return {
    entity_name: 'Sila Corp',
    first_name: 'Bob',
    last_name: 'Jones',
    address: '200 Finance Ave',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    country: 'US',
    ein: '12-3456789',
    ...overrides,
  }
}

describe('sila transformOrganization', () => {
  it('maps entity_name to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Sila Corp')
  })

  it('builds name from first+last when entity_name absent', () => {
    expect(transformOrganization(makeRaw({ entity_name: undefined })).name).toBe('Bob Jones')
  })

  it('maps ein to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('12-3456789')
  })

  it('sets currency to USD', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('USD')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
