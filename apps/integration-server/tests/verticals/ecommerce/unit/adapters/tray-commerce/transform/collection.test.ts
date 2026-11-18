/**
 * Docs: https://developers.tray.com.br/ `#consultar-arvore-de-categorias-get`,
 * `#cadastrar-categoria-post` — fetched with curl; see
 * `transform/collection.ts` header for the exact confirmed tree shape.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  flattenCategories,
  type RawTrayCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/tray-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function leaf(overrides: Partial<RawTrayCategory> = {}): RawTrayCategory {
  return {
    slug: 'subcategoria-teste',
    id: '456',
    parent_id: '',
    name: 'Subcategoria Teste',
    description: 'Descrição da Categoria de Teste',
    has_product: '1',
    children: null,
    ...overrides,
  }
}

function root(overrides: Partial<RawTrayCategory> = {}): RawTrayCategory {
  return {
    slug: 'categoria-teste',
    id: '123',
    parent_id: '',
    name: 'Categoria Teste',
    description: 'Descrição da Categoria de Teste',
    has_product: '1',
    children: [{ Category: leaf() }],
    ...overrides,
  }
}

describe('flattenCategories (Tray Commerce)', () => {
  it('flattens the documented {"Category": {..., children: [{"Category": {...}}]}} tree', () => {
    const flat = flattenCategories([root()])
    expect(flat.map((c) => c.id)).toEqual(['123', '456'])
  })

  it('handles a leaf with children: null', () => {
    const flat = flattenCategories([leaf()])
    expect(flat).toHaveLength(1)
  })

  it('handles multiple root categories, each with their own subtree', () => {
    const flat = flattenCategories([root(), leaf({ id: '789', name: 'Another Root' })])
    expect(flat.map((c) => c.id)).toEqual(['123', '456', '789'])
  })
})

describe('transformCollection (Tray Commerce)', () => {
  it('maps id, title (name), handle (slug) and description', () => {
    const result = transformCollection(leaf())
    expect(result.id).toBe('456')
    expect(result.title).toBe('Subcategoria Teste')
    expect(result.handle).toBe('subcategoria-teste')
    expect(result.description).toBe('Descrição da Categoria de Teste')
    expect(result.type).toBe('MANUAL')
  })

  it('preserves raw payload in metadata', () => {
    const raw = leaf()
    expect(transformCollection(raw).metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(leaf()))).not.toThrow()
  })

  it('round-trips name, description and slug via untransformCollection', () => {
    const collection = transformCollection(leaf())
    const body = untransformCollection(collection)
    expect(body['name']).toBe('Subcategoria Teste')
    expect(body['description']).toBe('Descrição da Categoria de Teste')
    expect(body['slug']).toBe('subcategoria-teste')
  })

  it('includes parent_id only when the raw category metadata carries one', () => {
    const withParent = transformCollection({ ...leaf(), parent_id: '123' })
    expect(untransformCollection(withParent)['parent_id']).toBe('123')
    const withoutParent = transformCollection(leaf({ parent_id: '' }))
    expect(untransformCollection(withoutParent)['parent_id']).toBeUndefined()
  })
})
