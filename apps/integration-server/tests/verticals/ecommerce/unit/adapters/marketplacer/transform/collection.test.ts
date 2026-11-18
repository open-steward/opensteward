/**
 * Marketplacer Taxon → Collection transform.
 * Docs: https://api.marketplacer.com/docs/seller-api/reference/queries/taxons/
 */
import { describe, it, expect } from 'vitest'
import { transformCollection } from '../../../../../../../src/verticals/ecommerce/adapters/marketplacer/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (Marketplacer taxon)', () => {
  it('maps displayName to title and treeName to description', () => {
    const raw = { id: 'VGF4b24tMjk2OA==', displayName: 'Mobile Phones', treeName: 'Technology - Mobile Phones' }
    const result = transformCollection(raw)
    expect(result.id).toBe('VGF4b24tMjk2OA==')
    expect(result.title).toBe('Mobile Phones')
    expect(result.description).toBe('Technology - Mobile Phones')
  })

  it('falls back to treeName then id when displayName is absent', () => {
    expect(transformCollection({ id: 't1', treeName: 'Tree' }).title).toBe('Tree')
    expect(transformCollection({ id: 't1' }).title).toBe('t1')
  })

  it('preserves raw in metadata', () => {
    const raw = { id: 't1', displayName: 'x' }
    expect(transformCollection(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const result = transformCollection({ id: 't1', displayName: 'Mobile Phones', treeName: 'Tech - Mobile' })
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})
