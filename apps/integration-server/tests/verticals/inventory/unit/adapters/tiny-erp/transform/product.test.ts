import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawTinyErpProduct,
} from '../../../../../../../src/verticals/inventory/adapters/tiny-erp/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct', () => {
  const baseRaw: RawTinyErpProduct = {
    id: 101,
    sku: 'WK-2026',
    descricao: 'Wireless Keyboard',
    descricaoComplementar: 'Bluetooth wireless keyboard, US layout.',
    tipo: 'S',
    situacao: 'A',
    unidade: 'each',
    gtin: '0123456789012',
    origem: 0,
    marca: { id: 5, nome: 'Keyboards Inc' },
    categoria: {
      id: 3,
      nome: 'Periféricos',
      caminhoCompleto: 'Eletrônicos > Periféricos',
    },
    produtoPai: { id: 99, sku: 'WK-BASE', descricao: 'Base Keyboard' },
    dimensoes: {
      largura: 13,
      altura: 3,
      comprimento: 44,
      pesoLiquido: 0.45,
      pesoBruto: 0.5,
    },
    precos: {
      preco: 49.9,
      precoPromocional: 39.9,
      precoCusto: 20.0,
      precoCustoMedio: 22.0,
    },
    estoque: {
      controlar: true,
      sobEncomenda: false,
      localizacao: 'A1-B2',
      minimo: 5,
      maximo: 100,
      quantidade: 30,
    },
    fornecedores: [
      { id: 7, nome: 'Fornecedor Alpha', codigoProdutoNoFornecedor: 'FA-001' },
      { id: 8, nome: 'Fornecedor Beta', codigoProdutoNoFornecedor: 'FB-002' },
    ],
    tipoVariacao: 'V',
    dataCriacao: '2024-03-01T00:00:00Z',
    dataAlteracao: '2024-03-15T00:00:00Z',
  }

  it('maps id and externalId to String(raw.id)', () => {
    const result = transformProduct(baseRaw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps sku from raw.sku', () => {
    const result = transformProduct(baseRaw)
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name from descricao', () => {
    const result = transformProduct(baseRaw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps description from descricaoComplementar', () => {
    const result = transformProduct(baseRaw)
    expect(result.description).toBe('Bluetooth wireless keyboard, US layout.')
  })

  it('maps upc from gtin', () => {
    const result = transformProduct(baseRaw)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps brand from marca.nome', () => {
    const result = transformProduct(baseRaw)
    expect(result.brand).toBe('Keyboards Inc')
  })

  it('maps category from categoria.caminhoCompleto (preferred over nome)', () => {
    const result = transformProduct(baseRaw)
    expect(result.category).toBe('Eletrônicos > Periféricos')
  })

  it('falls back to categoria.nome when caminhoCompleto is absent', () => {
    const raw: RawTinyErpProduct = {
      ...baseRaw,
      categoria: { id: 3, nome: 'Periféricos' },
    }
    const result = transformProduct(raw)
    expect(result.category).toBe('Periféricos')
  })

  it('converts pesoLiquido kg to grams (weightGrams = pesoLiquido * 1000)', () => {
    const result = transformProduct(baseRaw)
    // 0.45 kg → 450 g
    expect(result.weightGrams).toBe(450)
  })

  it('maps dimensionsCm from comprimento/largura/altura', () => {
    const result = transformProduct(baseRaw)
    expect(result.dimensionsCm).toEqual({ length: 44, width: 13, height: 3 })
  })

  it('converts precos.preco to minor units (centavos) for retailPrice', () => {
    const result = transformProduct(baseRaw)
    // 49.90 BRL → 4990 centavos
    expect(result.retailPrice).toEqual({ amount: 4990, currency: 'BRL' })
  })

  it('sets isActive true when situacao is "A"', () => {
    const result = transformProduct(baseRaw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when situacao is "I"', () => {
    const result = transformProduct({ ...baseRaw, situacao: 'I' })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive false when situacao is "E" (excluído)', () => {
    const result = transformProduct({ ...baseRaw, situacao: 'E' })
    expect(result.isActive).toBe(false)
  })

  it('maps parentProductId from produtoPai.id', () => {
    const result = transformProduct(baseRaw)
    expect(result.parentProductId).toBe('99')
  })

  it('collects supplierIds from fornecedores[].id as strings', () => {
    const result = transformProduct(baseRaw)
    expect(result.supplierIds).toEqual(['7', '8'])
  })

  it('skips supplier entries without id', () => {
    const raw: RawTinyErpProduct = {
      ...baseRaw,
      fornecedores: [{ nome: 'No ID Supplier' }, { id: 12 }],
    }
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['12'])
  })

  it('maps dataCriacao to createdAt as ISO string', () => {
    const result = transformProduct(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps dataAlteracao to updatedAt as ISO string', () => {
    const result = transformProduct(baseRaw)
    expect(result.updatedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to "tiny-erp"', () => {
    const result = transformProduct(baseRaw)
    expect(result.platform).toBe('tiny-erp')
  })

  it('defaults unitOfMeasure to "each" when unidade is absent', () => {
    const raw: RawTinyErpProduct = { id: 5 }
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('returns empty supplierIds array when fornecedores is absent', () => {
    const raw: RawTinyErpProduct = { id: 5 }
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual([])
  })

  it('passes ProductSchema validation', () => {
    const result = transformProduct(baseRaw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
