import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawVhsysProduct,
} from '../../../../../../../src/verticals/inventory/adapters/vhsys/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const baseRaw: RawVhsysProduct = {
  id_produto: '1001',
  cod_produto: 'WK-2026',
  desc_produto: 'Teclado Sem Fio',
  marca_produto: 'Keyboards Inc',
  atalho_produto: 'TSF',
  id_categoria: '5',
  id_fornecedor: '42',
  fornecedor_produto: 'Keyboards Inc',
  fornecedor_produto_id: '42',
  // Standalone product (produto_variado false) — no parent product.
  produto_variado: false,
  estoque_produto: 100,
  minimo_produto: 10,
  maximo_produto: 500,
  unidade_produto: 'each',
  valor_produto: 29.99,
  valor_custo_produto: 14.99,
  peso_produto: 0.45,
  codigo_barra_produto: '0123456789012',
  ncm_produto: '84716090',
  icms_produto: 12,
  ipi_produto: 0,
  obs_produto: 'Teclado bluetooth',
  ativo_produto: true,
  data_cadastro_produto: '2024-03-01T00:00:00Z',
  data_alteracao_produto: '2024-03-01T00:00:00Z',
}

describe('vhsys transformProduct', () => {
  it('maps id from id_produto', () => {
    expect(transformProduct(baseRaw).id).toBe('1001')
  })

  it('maps sku from cod_produto', () => {
    expect(transformProduct(baseRaw).sku).toBe('WK-2026')
  })

  it('maps name from desc_produto', () => {
    expect(transformProduct(baseRaw).name).toBe('Teclado Sem Fio')
  })

  it('maps description from obs_produto', () => {
    expect(transformProduct(baseRaw).description).toBe('Teclado bluetooth')
  })

  it('maps upc from codigo_barra_produto', () => {
    expect(transformProduct(baseRaw).upc).toBe('0123456789012')
  })

  it('maps brand from marca_produto', () => {
    expect(transformProduct(baseRaw).brand).toBe('Keyboards Inc')
  })

  it('maps category from id_categoria as string', () => {
    expect(transformProduct(baseRaw).category).toBe('5')
  })

  it('maps unitOfMeasure from unidade_produto', () => {
    expect(transformProduct(baseRaw).unitOfMeasure).toBe('each')
  })

  it('converts weight from kg to grams', () => {
    expect(transformProduct(baseRaw).weightGrams).toBeCloseTo(450)
  })

  it('converts retailPrice to minor units in BRL', () => {
    expect(transformProduct(baseRaw).retailPrice).toEqual({ amount: 2999, currency: 'BRL' })
  })

  it('converts cost to minor units in BRL', () => {
    // vhsys is the only adapter that also maps cost
    expect(transformProduct(baseRaw).cost).toEqual({ amount: 1499, currency: 'BRL' })
  })

  it('maps isActive from ativo_produto', () => {
    expect(transformProduct(baseRaw).isActive).toBe(true)
    expect(transformProduct({ ...baseRaw, ativo_produto: false }).isActive).toBe(false)
  })

  it('maps supplierIds from fornecedor_produto_id', () => {
    expect(transformProduct(baseRaw).supplierIds).toEqual(['42'])
  })

  it('maps createdAt and updatedAt from date fields', () => {
    const result = transformProduct(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to vhsys', () => {
    expect(transformProduct(baseRaw).platform).toBe('vhsys')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(baseRaw))).not.toThrow()
  })
})
