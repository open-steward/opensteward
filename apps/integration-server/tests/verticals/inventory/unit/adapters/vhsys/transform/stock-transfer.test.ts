import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawVhsysStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/vhsys/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

const baseRaw: RawVhsysStockTransfer = {
  id_transferencia: '200',
  numero_transferencia: 'TR-2024-001',
  id_deposito_origem: '7',
  id_deposito_destino: '8',
  situacao_transferencia: 'EM TRANSITO',
  data_transferencia: '2024-03-01T00:00:00Z',
  data_recebimento: '2024-03-05T00:00:00Z',
  itens: [{ id_produto: '1001', quantidade: 30, quantidade_recebida: 30 }],
}

describe('vhsys transformStockTransfer', () => {
  it('maps id from id_transferencia', () => {
    expect(transformStockTransfer(baseRaw).id).toBe('200')
  })

  it('maps number from numero_transferencia', () => {
    expect(transformStockTransfer(baseRaw).number).toBe('TR-2024-001')
  })

  it('maps fromLocationId from id_deposito_origem', () => {
    expect(transformStockTransfer(baseRaw).fromLocationId).toBe('7')
  })

  it('maps toLocationId from id_deposito_destino', () => {
    expect(transformStockTransfer(baseRaw).toLocationId).toBe('8')
  })

  it('maps status EM TRANSITO to in_transit', () => {
    expect(transformStockTransfer(baseRaw).status).toBe('in_transit')
  })

  it('maps status RASCUNHO to draft', () => {
    expect(transformStockTransfer({ ...baseRaw, situacao_transferencia: 'RASCUNHO' }).status).toBe(
      'draft',
    )
  })

  it('maps status RECEBIDO to completed', () => {
    expect(transformStockTransfer({ ...baseRaw, situacao_transferencia: 'RECEBIDO' }).status).toBe(
      'completed',
    )
  })

  it('maps status CANCELADO to cancelled', () => {
    expect(transformStockTransfer({ ...baseRaw, situacao_transferencia: 'CANCELADO' }).status).toBe(
      'cancelled',
    )
  })

  it('maps lines with productId and quantity', () => {
    const result = transformStockTransfer(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('1001')
    expect(result.lines[0]!.quantity).toBe(30)
    expect(result.lines[0]!.quantityReceived).toBe(30)
  })

  it('maps shippedAt from data_transferencia', () => {
    expect(transformStockTransfer(baseRaw).shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from data_recebimento', () => {
    expect(transformStockTransfer(baseRaw).receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to vhsys', () => {
    expect(transformStockTransfer(baseRaw).platform).toBe('vhsys')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(baseRaw))).not.toThrow()
  })
})
