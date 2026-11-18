import { describe, it, expect } from 'vitest'
import {
  isVariationChild,
  transformProduto,
  type RawLojaIntegradaProduto,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/produto'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'
import { PRODUTO_DETAIL, PRODUTO_LIST_OBJECTS } from '../fixtures'

const [simple, child, parent] = PRODUTO_LIST_OBJECTS as RawLojaIntegradaProduto[]

describe('transformProduto (loja-integrada)', () => {
  it('maps a documented GET /v1/produto row to a valid Product', () => {
    const p = ProductSchema.parse(transformProduto(simple!))
    expect(p.id).toBe('202591789')
    expect(p.title).toBe('Produto teste novo')
    expect(p.description).toBe('<strong>Desctição HTML do produto</strong>')
    expect(p.handle).toBe('produto-teste-novo-2023-02-10-10-10-48')
    // ativo: false is not documented as a draft; no status is claimed.
    expect(p.status).toBeUndefined()
    expect(p.metadata).toMatchObject({ tipo: 'normal', sku: 'prod-009' })
  })

  it('maps a parent (tipo atributo) as a product and marks an active one ACTIVE', () => {
    const p = ProductSchema.parse(transformProduto(parent!))
    expect(p.id).toBe('198399254')
    expect(p.title).toBe('Teste variação')
    expect(p.status).toBe('ACTIVE')
    expect(p.description).toBeUndefined()
  })

  it('marks a removed product ARCHIVED', () => {
    const p = ProductSchema.parse(transformProduto({ ...simple!, removido: true, ativo: true }))
    expect(p.status).toBe('ARCHIVED')
  })

  it('maps the single-product answer, images included, without guessing the zone of naive timestamps', () => {
    const p = ProductSchema.parse(transformProduto(PRODUTO_DETAIL as RawLojaIntegradaProduto))
    expect(p.id).toBe('238281213')
    expect(p.title).toBe('Adaptador Headset Para Controle Xbox - Microsoft')
    expect(p.images).toEqual([
      {
        id: '143127013',
        url: 'https://cdn.awsli.com.br/800x800/1736/1736356/produto/23828121319214f9e8d.jpg',
        position: 0,
      },
    ])
    // "2023-10-23T16:06:03.257071" names no zone.
    expect(p.createdAt).toBeUndefined()
    expect(p.updatedAt).toBeUndefined()
    expect(p.variants).toBeUndefined()
  })

  it('keeps a timestamp that names its zone', () => {
    const p = ProductSchema.parse(
      transformProduto({ ...simple!, data_modificacao: '2025-02-28T20:45:47.154Z' }),
    )
    expect(p.updatedAt).toBe('2025-02-28T20:45:47.154Z')
  })

  it('throws on a product with no nome rather than inventing a title', () => {
    expect(() => transformProduto({ ...simple!, nome: null })).toThrow(/no nome/)
  })

  it('tells a variation child (tipo atributo_opcao) from products', () => {
    expect(isVariationChild(child!)).toBe(true)
    expect(isVariationChild(simple!)).toBe(false)
    expect(isVariationChild(parent!)).toBe(false)
  })
})
