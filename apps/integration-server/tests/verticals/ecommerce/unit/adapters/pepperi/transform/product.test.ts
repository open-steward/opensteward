/**
 * Pepperi Item → canonical Product.
 *
 * Field names (`InternalID`, `ExternalID`, `Name`, `LongDescription`,
 * `Hidden`) are confirmed against Pepperi's own bundled `post_items_schema`
 * at https://storage.pepperi.com/Developer/developer_body.js, linked from
 * https://developer.pepperi.com/api-reference/item-resources/post-items/.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawPepperiItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/pepperi/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawPepperiItem> = {}): RawPepperiItem {
  return {
    InternalID: 4001,
    ExternalID: 'SKU-WIDGET-1',
    Name: 'Widget Pro',
    LongDescription: 'A very fine widget.',
    Hidden: false,
    ...overrides,
  }
}

describe('pepperi transformProduct', () => {
  it('maps ExternalID to the canonical id', () => {
    expect(transformProduct(makeItem()).id).toBe('SKU-WIDGET-1')
  })

  it('maps Name to title and LongDescription to description', () => {
    const result = transformProduct(makeItem())
    expect(result.title).toBe('Widget Pro')
    expect(result.description).toBe('A very fine widget.')
  })

  it('maps Hidden to ARCHIVED / ACTIVE status', () => {
    expect(transformProduct(makeItem({ Hidden: true })).status).toBe('ARCHIVED')
    expect(transformProduct(makeItem({ Hidden: false })).status).toBe('ACTIVE')
  })

  it('never sets createdAt/updatedAt — no date field is confirmed for Items', () => {
    const result = transformProduct(makeItem())
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('never returns variants — Pepperi Items have no separate variant resource', () => {
    expect(transformProduct(makeItem()).variants).toBeUndefined()
  })

  it('throws when ExternalID is absent rather than falling back to InternalID', () => {
    expect(() => transformProduct(makeItem({ ExternalID: null }))).toThrow(/ExternalID/)
  })

  it('throws when Name is absent rather than inventing an empty title', () => {
    expect(() => transformProduct(makeItem({ Name: null }))).toThrow(/Name/)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeItem()
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeItem()))).not.toThrow()
  })

  it('round-trips via untransformProduct for the POST /items upsert body', () => {
    const canonical = transformProduct(makeItem())
    expect(untransformProduct(canonical)).toEqual({
      ExternalID: 'SKU-WIDGET-1',
      Name: 'Widget Pro',
      LongDescription: 'A very fine widget.',
      Hidden: false,
    })
  })
})
