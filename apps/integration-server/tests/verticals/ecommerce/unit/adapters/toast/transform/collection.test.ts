/**
 * Toast Configuration API MenuGroup → Collection.
 *
 * Fixture fields come from the documented `MenuGroup` schema
 * (https://doc.toasttab.com/openapi/configuration/operation/menuGroupsGet/);
 * the spec publishes no example response.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawToastMenuGroup,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeMenuGroup(overrides: Partial<RawToastMenuGroup> = {}): RawToastMenuGroup {
  return {
    guid: 'c639a684-7245-4259-b9c5-f913e481347e',
    entityType: 'MenuGroup',
    name: 'Pizzas',
    menu: { guid: 'menu-1', entityType: 'Menu' },
    visibility: 'ALL',
    parent: null,
    items: [
      { guid: 'item-1', entityType: 'MenuItem' },
      { guid: 'item-2', entityType: 'MenuItem' },
    ],
    subgroups: [],
    optionGroups: [],
    inheritOptionGroups: false,
    images: [{ url: 'https://cdn.example.com/pizzas.jpg' }],
    unitOfMeasure: 'NONE',
    inheritUnitOfMeasure: true,
    ...overrides,
  }
}

describe('transformCollection (Toast)', () => {
  it('maps the documented fields and parses as a Collection', () => {
    const raw = makeMenuGroup()
    const result = CollectionSchema.parse(transformCollection(raw))
    expect(result.id).toBe('c639a684-7245-4259-b9c5-f913e481347e')
    expect(result.title).toBe('Pizzas')
    expect(result.productIds).toEqual(['item-1', 'item-2'])
    expect(result.image).toEqual({ url: 'https://cdn.example.com/pizzas.jpg' })
    expect(result.metadata).toEqual(raw)
  })

  it('invents no type, description or dates', () => {
    const result = CollectionSchema.parse(transformCollection(makeMenuGroup()))
    expect(result.type).toBeUndefined()
    expect(result.description).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('omits empty item lists and images', () => {
    const result = CollectionSchema.parse(
      transformCollection(makeMenuGroup({ items: [], images: [] })),
    )
    expect(result.productIds).toBeUndefined()
    expect(result.image).toBeUndefined()
  })

  it('throws rather than inventing a title when name is absent', () => {
    expect(() => transformCollection(makeMenuGroup({ name: undefined }))).toThrow(/no name/)
  })

  it('untransformCollection keeps the title and product ids', () => {
    const raw = untransformCollection(transformCollection(makeMenuGroup()))
    expect(raw['name']).toBe('Pizzas')
    expect(raw['menuItems']).toEqual([{ guid: 'item-1' }, { guid: 'item-2' }])
  })
})
