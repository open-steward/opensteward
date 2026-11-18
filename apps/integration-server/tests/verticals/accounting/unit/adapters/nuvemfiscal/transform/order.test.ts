import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type NuvemFiscalPedido } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/order'

function makeRaw(overrides: Partial<NuvemFiscalPedido> = {}): NuvemFiscalPedido {
  return {
    id_pedido: 30,
    id_cliente: 6,
    nome_cliente: 'Cliente A',
    moeda: 'BRL',
    valor_total: 800,
    data_pedido: '2024-07-15',
    status: 'ativo',
    endereco_entrega: '',
    cidade_entrega: '',
    cep_entrega: '',
    pais_entrega: '',
    endereco_faturamento: '',
    cidade_faturamento: '',
    cep_faturamento: '',
    pais_faturamento: '',
    itens: [],
    ...overrides,
  }
}

describe('nuvemfiscal transformOrder', () => {
  it('maps id_pedido to id as string', () => {
    expect(transformOrder(makeRaw()).id).toBe('30')
  })

  it('maps status=faturado to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'faturado' })).status).toBe('COMPLETED')
  })

  it('maps status=cancelado to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'cancelado' })).status).toBe('CANCELLED')
  })

  it('maps other status to ACTIVE', () => {
    expect(transformOrder(makeRaw({ status: 'ativo' })).status).toBe('ACTIVE')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })

  it('maps data_pedido to postedAt as Date', () => {
    expect(transformOrder(makeRaw()).postedAt).toEqual(new Date('2024-07-15'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrder(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
