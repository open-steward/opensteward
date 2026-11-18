/**
 * Centra Order API product category → canonical Collection.
 *
 * The Order API has no categories endpoint. GET <base>/products "will return
 * product data from Centra with categories", and each product row documents
 * `categories` as:
 *
 *   categories  array|string  required  "Array with names of the categories
 *   the product belongs to."
 *
 * (The page's inline "Like this:" snippet after that sentence renders
 * malformed, so it is not quoted here.)
 *
 * The documented response example is
 * `"categories": ["Collection \/ Jackets\/Outerwear", "New Arrivals"]`.
 * A category is therefore known only by its name path, which is both its id
 * and its title here. No id, handle, type or timestamp is documented.
 *
 * Docs: https://centra.dev/legacy/order-api/api-reference#get-products
 */

import type { Collection } from '../../../schema/collection'

/**
 * The category names on one product row, as documented: an array of name
 * strings, or (per the `array|string` type) a single name string.
 */
export function categoryNames(categories: unknown): string[] {
  if (typeof categories === 'string') return categories === '' ? [] : [categories]
  if (!Array.isArray(categories)) return []
  return categories.filter((c): c is string => typeof c === 'string' && c !== '')
}

export function transformCollection(name: string): Collection {
  return {
    id: name,
    title: name,
    metadata: { name },
  }
}
