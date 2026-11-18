/**
 * Docs: https://developers.tray.com.br/ `#listagem-de-pedidos-get`,
 * `#dados-completo-do-pedido-get`, `#cadastrar-pedido-post`,
 * `#atualizar-dados-do-pedido-put`, `#cancelar-pedido-put` — fetched with
 * curl; see `transform/order.ts` header for exactly which fields are real
 * example values vs. field-table entries, and why status maps only the
 * two documented strings.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrderForCreate,
  untransformOrderForUpdate,
  type RawTrayOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/tray-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawTrayOrder> = {}): RawTrayOrder {
  return {
    id: '1167',
    status: 'A ENVIAR',
    date: '2025-02-06',
    customer_id: '21',
    total: '825.39',
    has_payment: '1',
    modified: '2025-02-06 09:57:58',
    Customer: { id: '21', email: 'danilo.Carlos123@tray.net.br' },
    ProductsSold: [
      {
        ProductsSold: {
          id: '1425',
          product_id: '351',
          variant_id: '0',
          name: 'tenis azul (Ref. ref351)',
          quantity: '1',
          price: '900.00',
        },
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (Tray Commerce)', () => {
  it('maps id, customerId and email from the embedded Customer object', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1167')
    expect(result.customerId).toBe('21')
    expect(result.email).toBe('danilo.Carlos123@tray.net.br')
  })

  it('falls back to top-level customer_id when Customer is absent (the plain list shape)', () => {
    const result = transformOrder(makeOrder({ Customer: undefined, customer_id: '55' }))
    expect(result.customerId).toBe('55')
    expect(result.email).toBeUndefined()
  })

  it('defaults to BRL and converts total to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('BRL')
    expect(result.totalPrice).toEqual({ amount: 82539, currency: 'BRL' })
  })

  it('maps a fully-detailed ProductsSold entry (the /complete shape) to a line item', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]).toMatchObject({
      id: '1425',
      productId: '351',
      title: 'tenis azul (Ref. ref351)',
      quantity: 1,
      price: { amount: 90000, currency: 'BRL' },
    })
  })

  it('omits variantId when variant_id is the sentinel "0"', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems?.[0]?.variantId).toBeUndefined()
  })

  it('produces no line items from the bare {id} shape the plain list endpoint returns', () => {
    const result = transformOrder(makeOrder({ ProductsSold: [{ id: '5' }] }))
    expect(result.lineItems).toBeUndefined()
  })

  it.each([
    ['A ENVIAR', 'UNFULFILLED'],
    ['FINALIZADO', 'FULFILLED'],
    ['CANCELADO', undefined],
    ['Anything Else', undefined],
  ])('maps documented status %s to fulfillmentStatus %s, everything else to undefined', (raw, expected) => {
    expect(transformOrder(makeOrder({ status: raw })).fulfillmentStatus).toBe(expected)
  })

  it.each([
    ['1', 'PAID'],
    ['0', 'PENDING'],
  ])('maps the has_payment flag %s to financialStatus %s (a boolean flag, not a status string)', (flag, expected) => {
    expect(transformOrder(makeOrder({ has_payment: flag })).financialStatus).toBe(expected)
  })

  it('leaves financialStatus undefined when has_payment is absent', () => {
    expect(transformOrder(makeOrder({ has_payment: undefined })).financialStatus).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('also satisfies OrderSchema for a minimal order with an undocumented status and no line items', () => {
    const result = transformOrder(
      makeOrder({ status: 'Something Undocumented', ProductsSold: undefined, Customer: undefined, customer_id: undefined }),
    )
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrderForCreate (Tray Commerce)', () => {
  it('nests email and line items under Customer, matching the documented (if unusual) create shape', () => {
    const order = transformOrder(makeOrder())
    const body = untransformOrderForCreate(order) as {
      Customer?: { email?: string; ProductsSold?: Array<{ product_id?: string; quantity?: number }> }
    }
    expect(body.Customer?.email).toBe('danilo.Carlos123@tray.net.br')
    expect(body.Customer?.ProductsSold?.[0]).toMatchObject({ product_id: '351', quantity: 1 })
  })

  it('omits Customer entirely when there is neither an email nor line items', () => {
    const body = untransformOrderForCreate({})
    expect(body['Customer']).toBeUndefined()
  })
})

describe('untransformOrderForUpdate (Tray Commerce)', () => {
  it('maps note to store_note', () => {
    expect(untransformOrderForUpdate({ note: 'Leave at front desk.' })).toEqual({
      store_note: 'Leave at front desk.',
    })
  })

  it('omits fields the caller did not set', () => {
    expect(untransformOrderForUpdate({})).toEqual({})
  })
})
