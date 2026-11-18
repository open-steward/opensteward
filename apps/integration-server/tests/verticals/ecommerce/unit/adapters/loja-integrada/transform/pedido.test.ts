import { describe, it, expect } from 'vitest'
import {
  transformPedido,
  type RawLojaIntegradaPedido,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/pedido'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { PEDIDO_DETAIL, PEDIDO_SEARCH_OBJECT } from '../fixtures'

describe('transformPedido (loja-integrada)', () => {
  it('maps a documented GET /v1/pedido/search row to a valid Order keyed by numero', () => {
    const o = OrderSchema.parse(transformPedido(PEDIDO_SEARCH_OBJECT as RawLojaIntegradaPedido))
    expect(o.id).toBe('164')
    expect(o.orderNumber).toBe('164')
    expect(o.customerId).toBe('34220641')
    // No money: the API never states a currency.
    expect(o.totalPrice).toBeUndefined()
    expect(o.currency).toBeUndefined()
    expect(o.createdAt).toBeUndefined()
    expect(o.financialStatus).toBeUndefined()
    expect(o.metadata).toMatchObject({ valor_total: '106.38' })
  })

  it('maps the single-order answer: customer, address and child ids', () => {
    const o = OrderSchema.parse(transformPedido(PEDIDO_DETAIL as RawLojaIntegradaPedido))
    expect(o).toMatchObject({
      id: '165',
      customerId: '34220641',
      email: 'teste@lojateste.com.br',
      shippingAddress: {
        line1: 'Avenida Nova York, 1',
        city: 'Rio de Janeiro',
        region: 'RJ',
        postalCode: '21041040',
      },
      fulfillmentIds: ['165:69291055'],
      transactionIds: ['165:69291176'],
    })
    expect(o.lineItems).toBeUndefined()
    expect(o.note).toBeUndefined()
  })

  it('maps the customer note (cliente_obs), and lists only children that carry an id', () => {
    const o = OrderSchema.parse(
      transformPedido({
        ...(PEDIDO_DETAIL as RawLojaIntegradaPedido),
        cliente_obs: 'Entregar pela manhã',
        envios: [{ id: 69291055 }, {}],
        pagamentos: [{}, { id: 69291176 }],
      }),
    )
    expect(o.note).toBe('Entregar pela manhã')
    expect(o.fulfillmentIds).toEqual(['165:69291055'])
    expect(o.transactionIds).toEqual(['165:69291176'])
  })

  it('reads the customer id only from a whole cliente resource URI', () => {
    const base = PEDIDO_SEARCH_OBJECT as RawLojaIntegradaPedido
    expect(
      transformPedido({ ...base, cliente: '/api/v1/cliente/34220641/' }).customerId,
    ).toBeUndefined()
    expect(
      transformPedido({ ...base, cliente: '/api/v1/cliente/34220641x' }).customerId,
    ).toBeUndefined()
  })
})
