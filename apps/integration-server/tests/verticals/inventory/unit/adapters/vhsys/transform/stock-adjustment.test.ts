import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawVhsysStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/vhsys/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const baseRaw: RawVhsysStockAdjustment = {
  id_lancamento: '55',
  id_produto: '1001',
  id_deposito: '7',
  motivo_lancamento: 'contagem de estoque',
  tipo_lancamento: 'ENTRADA',
  situacao_lancamento: 'APROVADO',
  quantidade: 100,
  quantidade_anterior: 90,
  data_lancamento: '2024-03-01T00:00:00Z',
  usuario_lancamento: 'jdoe',
  observacao_lancamento: 'Inventário mensal',
}

describe('vhsys transformStockAdjustment', () => {
  it('maps id from id_lancamento', () => {
    expect(transformStockAdjustment(baseRaw).id).toBe('55')
  })

  it('maps locationId from id_deposito', () => {
    expect(transformStockAdjustment(baseRaw).locationId).toBe('7')
  })

  it('maps reason cycle_count from "contagem" motivo', () => {
    expect(transformStockAdjustment(baseRaw).reason).toBe('cycle_count')
  })

  it('maps reason damage from "dano" motivo', () => {
    const result = transformStockAdjustment({ ...baseRaw, motivo_lancamento: 'dano no produto' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason theft from "furto" motivo', () => {
    const result = transformStockAdjustment({
      ...baseRaw,
      motivo_lancamento: 'furto de mercadoria',
    })
    expect(result.reason).toBe('theft')
  })

  it('maps reason expiration from "vencimento" motivo', () => {
    const result = transformStockAdjustment({
      ...baseRaw,
      motivo_lancamento: 'vencimento do produto',
    })
    expect(result.reason).toBe('expiration')
  })

  it('maps reason correction from "correcao" motivo', () => {
    const result = transformStockAdjustment({
      ...baseRaw,
      motivo_lancamento: 'correcao de estoque',
    })
    expect(result.reason).toBe('correction')
  })

  it('computes deltaQuantity as quantidade minus quantidade_anterior', () => {
    const result = transformStockAdjustment(baseRaw)
    expect(result.lines[0]!.deltaQuantity).toBe(10) // 100 - 90
  })

  it('uses raw quantidade as deltaQuantity when quantidade_anterior is absent', () => {
    const result = transformStockAdjustment({ ...baseRaw, quantidade_anterior: undefined })
    expect(result.lines[0]!.deltaQuantity).toBe(100)
  })

  it('maps countedQuantity when quantidade_anterior is known', () => {
    // countedQuantity = qty when previous is known
    expect(transformStockAdjustment(baseRaw).lines[0]!.countedQuantity).toBe(100)
  })

  it('maps line productId from id_produto', () => {
    expect(transformStockAdjustment(baseRaw).lines[0]!.productId).toBe('1001')
  })

  it('maps adjustedAt from data_lancamento', () => {
    expect(transformStockAdjustment(baseRaw).adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from usuario_lancamento', () => {
    expect(transformStockAdjustment(baseRaw).adjustedBy).toBe('jdoe')
  })

  it('sets platform to vhsys', () => {
    expect(transformStockAdjustment(baseRaw).platform).toBe('vhsys')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(baseRaw))).not.toThrow()
  })
})
