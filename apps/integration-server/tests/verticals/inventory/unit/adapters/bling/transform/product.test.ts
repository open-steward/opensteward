import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawBlingProduct,
} from '../../../../../../../src/verticals/inventory/adapters/bling/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('bling transformProduct', () => {
  const raw: RawBlingProduct = {
    id: 9876,
    idProdutoPai: null,
    nome: 'Teclado Sem Fio',
    codigo: 'TEC-SW-001',
    preco: 199.9,
    precoCusto: 89.9,
    situacao: 'A',
    formato: 'S',
    descricaoCurta: 'Teclado sem fio bluetooth',
    gtin: '7891234560123',
    marca: 'TechBR',
    unidade: 'each',
    pesoLiquido: 0.45,
    dimensoes: {
      largura: 13,
      altura: 3,
      profundidade: 44,
    },
    categoria: { id: 100 },
    fornecedor: { id: 500, codigo: 'FOR-001' },
    estoque: { minimo: 10, maximo: 200, localizacao: 'A1' },
  }

  it('maps id as string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('9876')
    expect(result.externalId).toBe('9876')
  })

  it('maps sku from codigo', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('TEC-SW-001')
  })

  it('maps name from nome', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Teclado Sem Fio')
  })

  it('maps upc from gtin', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('7891234560123')
  })

  it('maps brand from marca', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('TechBR')
  })

  it('maps category as string from categoria.id', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('100')
  })

  it('sets isActive true when situacao is A', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when situacao is I', () => {
    const result = transformProduct({ ...raw, situacao: 'I' })
    expect(result.isActive).toBe(false)
  })

  it('converts preco to minor units for retailPrice', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(19990)
    expect(result.retailPrice?.currency).toBe('BRL')
  })

  it('converts pesoLiquido to grams (kg * 1000)', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(450)
  })

  it('maps dimensionsCm with profundidade→length, largura→width, altura→height', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBe(44)
    expect(result.dimensionsCm?.width).toBe(13)
    expect(result.dimensionsCm?.height).toBe(3)
  })

  it('adds fornecedor id to supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['500'])
  })

  it('sets platform to bling', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('bling')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
