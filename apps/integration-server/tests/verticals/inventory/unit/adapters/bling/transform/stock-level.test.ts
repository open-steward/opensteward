import { describe, it, expect } from 'vitest'
import {
  transformStockLevels,
  type RawBlingStockBalance,
} from '../../../../../../../src/verticals/inventory/adapters/bling/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('bling transformStockLevels', () => {
  const raw: RawBlingStockBalance = {
    produto: { id: 9876 },
    saldoFisicoTotal: 120,
    saldoVirtualTotal: 110,
    depositos: [
      { id: 42, saldoFisico: 80, saldoVirtual: 75 },
      { id: 43, saldoFisico: 40, saldoVirtual: 35 },
    ],
  }

  it('returns one StockLevel per deposito', () => {
    const results = transformStockLevels(raw)
    expect(results).toHaveLength(2)
  })

  it('computes id as productId:depositoId', () => {
    const results = transformStockLevels(raw)
    expect(results[0]!.id).toBe('9876:42')
    expect(results[1]!.id).toBe('9876:43')
  })

  it('maps productId from produto.id', () => {
    const results = transformStockLevels(raw)
    expect(results[0]!.productId).toBe('9876')
  })

  it('maps locationId from deposito id', () => {
    const results = transformStockLevels(raw)
    expect(results[0]!.locationId).toBe('42')
    expect(results[1]!.locationId).toBe('43')
  })

  it('maps quantityOnHand from saldoFisico', () => {
    const results = transformStockLevels(raw)
    expect(results[0]!.quantityOnHand).toBe(80)
    expect(results[1]!.quantityOnHand).toBe(40)
  })

  it('maps quantityAvailable from saldoVirtual', () => {
    const results = transformStockLevels(raw)
    expect(results[0]!.quantityAvailable).toBe(75)
    expect(results[1]!.quantityAvailable).toBe(35)
  })

  it('emits aggregate record when no depositos', () => {
    const results = transformStockLevels({
      produto: { id: 9876 },
      saldoFisicoTotal: 120,
      saldoVirtualTotal: 110,
    })
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe('9876:all')
    expect(results[0]!.locationId).toBe('')
    expect(results[0]!.quantityOnHand).toBe(120)
    expect(results[0]!.quantityAvailable).toBe(110)
  })

  it('sets platform to bling', () => {
    const results = transformStockLevels(raw)
    expect(results[0]!.platform).toBe('bling')
  })

  it('all results satisfy StockLevelSchema', () => {
    const results = transformStockLevels(raw)
    for (const r of results) {
      expect(() => StockLevelSchema.parse(r)).not.toThrow()
    }
  })
})
