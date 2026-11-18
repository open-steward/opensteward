import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type NuvemFiscalOrdemVenda } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/salesorder'

function makeRaw(overrides: Partial<NuvemFiscalOrdemVenda> = {}): NuvemFiscalOrdemVenda {
  return {
    id_ordem_venda: 55,
    id_cliente: 12,
    nome_cliente: 'Cliente B',
    moeda: 'BRL',
    valor_total: 600,
    data_ordem: '2024-09-10',
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

describe('nuvemfiscal transformSalesOrder', () => {
  it('maps id_ordem_venda to id as string', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('55')
  })

  it('maps status=faturado to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'faturado' })).status).toBe('COMPLETED')
  })

  it('maps status=cancelado to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'cancelado' })).status).toBe('CANCELLED')
  })

  it('maps id_cliente to contactId as string', () => {
    expect(transformSalesOrder(makeRaw()).contactId).toBe('12')
  })

  it('maps data_ordem to postedAt as Date', () => {
    expect(transformSalesOrder(makeRaw()).postedAt).toEqual(new Date('2024-09-10'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformSalesOrder(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
