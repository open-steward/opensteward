/**
 * Centra documents `categories` on each GET products row as "Array with names
 * of the categories the product belongs to.", with the response example
 * `"categories": ["Collection \/ Jackets\/Outerwear", "New Arrivals"]`
 * (https://centra.dev/legacy/order-api/api-reference#get-products).
 */
import { describe, it, expect } from 'vitest'
import {
  categoryNames,
  transformCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

/** The documented example product row's `categories`, as JSON decodes it. */
const DOCUMENTED = JSON.parse(
  '{"categories": ["Collection \\/ Jackets\\/Outerwear", "New Arrivals"]}',
) as { categories: unknown }

describe('categoryNames', () => {
  it('reads the documented array of name strings', () => {
    expect(categoryNames(DOCUMENTED.categories)).toEqual([
      'Collection / Jackets/Outerwear',
      'New Arrivals',
    ])
  })

  it('reads a single name string (the documented type is array|string)', () => {
    expect(categoryNames('New Arrivals')).toEqual(['New Arrivals'])
  })

  it('reads nothing from an absent, empty or non-string value', () => {
    expect(categoryNames(undefined)).toEqual([])
    expect(categoryNames('')).toEqual([])
    expect(categoryNames([{ categoryId: 1, name: 'x' }, ''])).toEqual([])
  })
})

describe('transformCollection', () => {
  it('uses the documented name path as id and title', () => {
    const [name] = categoryNames(DOCUMENTED.categories)
    const result = CollectionSchema.parse(transformCollection(name!))
    expect(result).toEqual({
      id: 'Collection / Jackets/Outerwear',
      title: 'Collection / Jackets/Outerwear',
      metadata: { name: 'Collection / Jackets/Outerwear' },
    })
  })

  it('invents no undocumented fields', () => {
    const result = CollectionSchema.parse(transformCollection('New Arrivals'))
    expect(result.type).toBeUndefined()
    expect(result.handle).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })
})
