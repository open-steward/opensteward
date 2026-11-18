import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type OmieOrder } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/order'

function makeRaw(overrides: Partial<OmieOrder> = {}): OmieOrder {
  return {
    codigo_pedido: 90,
    numero_pedido: 'PED-090',
    codigo_cliente: 11,
    moeda: 'BRL',
    data_pedido: '2024-08-10',
    status: 'ABERTO',
    valor_total: 1500,
    valor_imposto: 150,
    itens: [],
    ...overrides,
  }
}

describe('omie transformOrder', () => {
  it('maps codigo_pedido to id as string', () => {
    expect(transformOrder(makeRaw()).id).toBe('90')
  })

  it('maps status=FATURADO to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'FATURADO' })).status).toBe('COMPLETED')
  })

  it('maps status=CANCELADO to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'CANCELADO' })).status).toBe('CANCELLED')
  })

  it('maps status=RASCUNHO to DRAFT', () => {
    expect(transformOrder(makeRaw({ status: 'RASCUNHO' })).status).toBe('DRAFT')
  })

  it('maps other status to ACTIVE', () => {
    expect(transformOrder(makeRaw({ status: 'ABERTO' })).status).toBe('ACTIVE')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })

  it('maps data_pedido to postedAt as Date', () => {
    expect(transformOrder(makeRaw()).postedAt).toEqual(new Date('2024-08-10'))
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
