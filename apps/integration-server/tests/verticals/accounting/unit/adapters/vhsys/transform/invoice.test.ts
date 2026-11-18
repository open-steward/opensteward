import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type VhsysPedido,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makePedido(overrides: Partial<VhsysPedido> = {}): VhsysPedido {
  return {
    id_pedido: 42,
    numero_pedido: '2024-042',
    id_cliente: 7,
    nome_cliente: 'Loja ABC',
    data_pedido: '2024-03-20',
    data_entrega: '2024-04-20',
    situacao_pedido: 'A',
    valor_total: '1500.00',
    moeda_pedido: 'BRL',
    observacao_pedido: 'Urgent delivery',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makePedido())
    expect(result.id).toBe('42')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('2024-042')
    expect(result.contactId).toBe('7')
    expect(result.currency).toBe('BRL')
    expect(result.notes).toBe('Urgent delivery')
  })

  it('converts valor_total to minor units', () => {
    const result = transformInvoice(makePedido({ valor_total: '1500.00' }))
    expect(result.totalAmount).toBe(150000)
  })

  it('maps situacao_pedido A to AUTHORIZED', () => {
    const result = transformInvoice(makePedido({ situacao_pedido: 'A' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps situacao_pedido F to PAID', () => {
    const result = transformInvoice(makePedido({ situacao_pedido: 'F' }))
    expect(result.status).toBe('PAID')
  })

  it('maps situacao_pedido C to VOIDED', () => {
    const result = transformInvoice(makePedido({ situacao_pedido: 'C' }))
    expect(result.status).toBe('VOIDED')
  })

  it('defaults currency to BRL when absent', () => {
    const result = transformInvoice(makePedido({ moeda_pedido: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('falls back to id_pedido as invoiceNumber when numero_pedido absent', () => {
    const result = transformInvoice(makePedido({ numero_pedido: undefined }))
    expect(result.invoiceNumber).toBe('42')
  })

  it('passes raw as metadata', () => {
    const raw = makePedido()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps line items with minor-unit conversion', () => {
    const raw = makePedido({
      itens: [
        {
          id_item: 1,
          id_produto: 10,
          descricao_item: 'Widget',
          qtde_item: 3,
          valor_unit_item: '50.00',
          valor_total_item: '150.00',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('10')
    expect(li.unitAmount).toBe(5000)
    expect(li.totalAmount).toBe(15000)
    expect(li.unitQuantity).toBe(3)
  })

  it('produces a schema-valid result', () => {
    const result = transformInvoice(makePedido())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice', () => {
    const canonical = transformInvoice(
      makePedido({ id_cliente: 9, moeda_pedido: 'USD', observacao_pedido: 'Note here' }),
    )
    const body = untransformInvoice(canonical)
    expect(body['id_cliente']).toBe('9')
    expect(body['moeda_pedido']).toBe('USD')
    expect(body['observacao_pedido']).toBe('Note here')
  })
})
