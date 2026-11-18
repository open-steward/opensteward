import { describe, it, expect } from 'vitest'
import {
  transformList,
  type RawGoDaddyList,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/list'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

/** Fields from the `List` reference (https://developer.godaddy.com/docs/references/rest/catalog/list/queries/list). */
function makeList(overrides: Partial<RawGoDaddyList> = {}): RawGoDaddyList {
  return {
    id: 'LIST_ID',
    name: 'summer_sale',
    label: 'Summer sale',
    description: 'Seasonal picks',
    status: 'ACTIVE',
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-28T11:30:00.000Z',
    ...overrides,
  }
}

describe('transformList (GoDaddy List → Collection)', () => {
  it('parses against the canonical CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformList(makeList()))).not.toThrow()
  })

  it('maps the documented fields and leaves type unset', () => {
    const c = transformList(makeList())
    expect(c.id).toBe('LIST_ID')
    expect(c.title).toBe('Summer sale')
    expect(c.handle).toBe('summer-sale')
    expect(c.description).toBe('Seasonal picks')
    expect(c.updatedAt).toBe('2026-08-28T11:30:00.000Z')
    expect(c.type).toBeUndefined()
  })

  it('titles a list without a label by its name', () => {
    expect(transformList(makeList({ label: null })).title).toBe('summer_sale')
  })
})
