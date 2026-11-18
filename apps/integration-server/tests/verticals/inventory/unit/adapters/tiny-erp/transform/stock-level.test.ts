import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  transformStockLevels,
  type RawTinyErpStockLevel,
  type RawTinyErpStockDeposito,
} from '../../../../../../../src/verticals/inventory/adapters/tiny-erp/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevels', () => {
  const dep1: RawTinyErpStockDeposito = {
    id: 42,
    nome: 'Depósito Central',
    desconsiderar: false,
    saldo: 100,
    reservado: 10,
    disponivel: 90,
    empresa: 'Empresa ABC',
  }

  const dep2: RawTinyErpStockDeposito = {
    id: 55,
    nome: 'Depósito Secundário',
    saldo: 25,
    reservado: 0,
    disponivel: 25,
  }

  const baseRaw: RawTinyErpStockLevel = {
    id: 101,
    nome: 'Wireless Keyboard',
    codigo: 'WK-2026',
    unidade: 'UN',
    saldo: 125,
    reservado: 10,
    disponivel: 115,
    localizacao: 'A1-B2',
    depositos: [dep1, dep2],
  }

  it('emits one StockLevel record per deposito', () => {
    const results = transformStockLevels(baseRaw)
    expect(results).toHaveLength(2)
  })

  it('constructs id as "productId:locationId" using deposito.id', () => {
    const results = transformStockLevels(baseRaw)
    expect(results[0]!.id).toBe('101:42')
    expect(results[1]!.id).toBe('101:55')
  })

  it('sets productId from raw.id', () => {
    const results = transformStockLevels(baseRaw)
    expect(results[0]!.productId).toBe('101')
  })

  it('sets locationId from deposito.id as string', () => {
    const results = transformStockLevels(baseRaw)
    expect(results[0]!.locationId).toBe('42')
  })

  it('maps deposito.saldo to quantityOnHand', () => {
    const results = transformStockLevels(baseRaw)
    expect(results[0]!.quantityOnHand).toBe(100)
  })

  it('maps deposito.disponivel to quantityAvailable', () => {
    const results = transformStockLevels(baseRaw)
    expect(results[0]!.quantityAvailable).toBe(90)
  })

  it('maps deposito.reservado to quantityCommitted', () => {
    const results = transformStockLevels(baseRaw)
    expect(results[0]!.quantityCommitted).toBe(10)
  })

  it('sets platform to "tiny-erp" on each record', () => {
    const results = transformStockLevels(baseRaw)
    for (const r of results) {
      expect(r.platform).toBe('tiny-erp')
    }
  })

  it('stores depositoNome in metadata', () => {
    const results = transformStockLevels(baseRaw)
    expect(results[0]!.metadata['depositoNome']).toBe('Depósito Central')
  })

  it('uses deposito.nome as locationId when deposito.id is absent', () => {
    const rawNoId: RawTinyErpStockLevel = {
      ...baseRaw,
      depositos: [{ nome: 'Dep Sem ID', saldo: 5 }],
    }
    const results = transformStockLevels(rawNoId)
    expect(results[0]!.locationId).toBe('Dep Sem ID')
    expect(results[0]!.id).toBe('101:Dep Sem ID')
  })

  describe('aggregate fallback (no depositos)', () => {
    const aggregateRaw: RawTinyErpStockLevel = {
      id: 202,
      nome: 'Another Product',
      saldo: 55,
      reservado: 3,
      disponivel: 52,
      localizacao: 'B5',
    }

    it('emits exactly one aggregate record when depositos is absent', () => {
      const results = transformStockLevels(aggregateRaw)
      expect(results).toHaveLength(1)
    })

    it('uses "productId:aggregate" as the id', () => {
      const results = transformStockLevels(aggregateRaw)
      expect(results[0]!.id).toBe('202:aggregate')
    })

    it('sets locationId to empty string for aggregate record', () => {
      const results = transformStockLevels(aggregateRaw)
      expect(results[0]!.locationId).toBe('')
    })

    it('maps top-level saldo to quantityOnHand', () => {
      const results = transformStockLevels(aggregateRaw)
      expect(results[0]!.quantityOnHand).toBe(55)
    })

    it('defaults quantityOnHand to 0 when saldo is absent', () => {
      const results = transformStockLevels({ id: 303 })
      expect(results[0]!.quantityOnHand).toBe(0)
    })

    it('passes StockLevelSchema validation for aggregate', () => {
      const results = transformStockLevels(aggregateRaw)
      expect(() => StockLevelSchema.parse(results[0]!)).not.toThrow()
    })
  })

  it('passes StockLevelSchema validation for each deposito record', () => {
    const results = transformStockLevels(baseRaw)
    for (const r of results) {
      expect(() => StockLevelSchema.parse(r)).not.toThrow()
    }
  })
})

describe('transformStockLevel', () => {
  const baseRaw: RawTinyErpStockLevel = {
    id: 101,
    depositos: [
      { id: 42, nome: 'First', saldo: 100 },
      { id: 55, nome: 'Second', saldo: 25 },
    ],
  }

  it('returns the first deposito record (first element of transformStockLevels)', () => {
    const result = transformStockLevel(baseRaw)
    expect(result.id).toBe('101:42')
    expect(result.locationId).toBe('42')
    expect(result.quantityOnHand).toBe(100)
  })

  it('returns the aggregate record when no depositos exist', () => {
    const raw: RawTinyErpStockLevel = { id: 202, saldo: 77 }
    const result = transformStockLevel(raw)
    expect(result.id).toBe('202:aggregate')
    expect(result.quantityOnHand).toBe(77)
  })

  it('passes StockLevelSchema validation', () => {
    const result = transformStockLevel(baseRaw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
