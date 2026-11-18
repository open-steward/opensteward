import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MazumaBusiness } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/organization'

function makeRaw(overrides: Partial<MazumaBusiness> = {}): MazumaBusiness {
  return { ...overrides }
}

describe('mazuma transformOrganization', () => {
  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })
  it('defaults currency to GBP', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('GBP')
  })
  it('maps name', () => {
    expect(transformOrganization(makeRaw({ name: 'Mazuma Co' })).name).toBe('Mazuma Co')
  })
  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeRaw({ tax_number: 'GB123456789' })).taxNumber).toBe('GB123456789')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
