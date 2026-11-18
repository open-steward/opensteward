import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawVhsysStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/vhsys/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const baseRaw: RawVhsysStockLevel = {
  id_produto: '1001',
  id_deposito: '7',
  nome_deposito: 'Depósito Principal',
  estoque_atual: 250,
  estoque_disponivel: 240,
  estoque_reservado: 10,
  estoque_entrada: 50,
  minimo_produto: 30,
  maximo_produto: 500,
  data_ultimo_inventario: '2024-03-01T00:00:00Z',
}

describe('vhsys transformStockLevel', () => {
  it('builds composite id from id_produto and id_deposito', () => {
    expect(transformStockLevel(baseRaw).id).toBe('1001:7')
  })

  it('uses only productId as id when id_deposito absent', () => {
    const result = transformStockLevel({ ...baseRaw, id_deposito: undefined })
    expect(result.id).toBe('1001')
  })

  it('maps productId from id_produto', () => {
    expect(transformStockLevel(baseRaw).productId).toBe('1001')
  })

  it('maps locationId from id_deposito', () => {
    expect(transformStockLevel(baseRaw).locationId).toBe('7')
  })

  it('maps quantityOnHand from estoque_atual', () => {
    expect(transformStockLevel(baseRaw).quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from estoque_disponivel', () => {
    expect(transformStockLevel(baseRaw).quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from estoque_reservado', () => {
    expect(transformStockLevel(baseRaw).quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from estoque_entrada', () => {
    expect(transformStockLevel(baseRaw).quantityIncoming).toBe(50)
  })

  it('maps reorderPoint from minimo_produto', () => {
    expect(transformStockLevel(baseRaw).reorderPoint).toBe(30)
  })

  it('maps reorderQuantity from maximo_produto', () => {
    expect(transformStockLevel(baseRaw).reorderQuantity).toBe(500)
  })

  it('maps lastCountedAt from data_ultimo_inventario', () => {
    expect(transformStockLevel(baseRaw).lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to vhsys', () => {
    expect(transformStockLevel(baseRaw).platform).toBe('vhsys')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(baseRaw))).not.toThrow()
  })
})
