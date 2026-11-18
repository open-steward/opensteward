import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type FireflyUserGroupResource,
} from '../../../../../../../src/verticals/accounting/adapters/firefly-iii/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(
  overrides: Partial<FireflyUserGroupResource['attributes']> = {},
): FireflyUserGroupResource {
  return {
    type: 'user-groups',
    id: '1',
    attributes: {
      created_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      title: 'Acme Corp Finances',
      primary_currency_code: 'USD',
      primary_currency_id: '1',
      in_use: true,
      ...overrides,
    },
  }
}

describe('transformOrganization (firefly-iii)', () => {
  it('maps id from resource id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('1')
  })

  it('maps title to name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Acme Corp Finances')
  })

  it('maps primary_currency_code to currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('USD')
  })

  it('maps created_at to createdAt', () => {
    expect(transformOrganization(makeOrg()).createdAt).toEqual(new Date('2023-01-01T00:00:00.000Z'))
  })

  it('maps updated_at to updatedAt', () => {
    expect(transformOrganization(makeOrg()).updatedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('handles missing optional date fields gracefully', () => {
    const result = transformOrganization(makeOrg({ created_at: undefined, updated_at: undefined }))
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('produces a schema-valid Organization', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeOrg()))).not.toThrow()
  })
})
