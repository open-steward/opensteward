import { describe, it, expect } from 'vitest'
import {
  splitName,
  transformCliente,
  type RawLojaIntegradaCliente,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/cliente'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import { CLIENTE_DETAIL, CLIENTE_LIST_OBJECT } from '../fixtures'

describe('transformCliente (loja-integrada)', () => {
  it('maps a documented GET /v1/cliente row to a valid Customer', () => {
    const c = CustomerSchema.parse(transformCliente(CLIENTE_LIST_OBJECT as RawLojaIntegradaCliente))
    expect(c).toMatchObject({
      id: '52222027',
      email: '58745ebcf9@boxomail.live',
      firstName: 'João',
      lastName: 'Exemplo',
    })
    // "2022-10-17 13:21:05.176725" names no zone.
    expect(c.createdAt).toBeUndefined()
    expect(c.updatedAt).toBeUndefined()
    expect(c.totalSpent).toBeUndefined()
  })

  it('maps the single-customer answer: newsletter, phone and addresses', () => {
    const c = CustomerSchema.parse(transformCliente(CLIENTE_DETAIL as RawLojaIntegradaCliente))
    expect(c.acceptsMarketing).toBe(true)
    expect(c.phone).toBe('1133334444')
    const address = {
      line1: 'Rua das Flores, 123',
      line2: 'Apartamento 32',
      city: 'São Paulo',
      region: 'SP',
      postalCode: '02960030',
    }
    expect(c.addresses).toEqual([address])
    expect(c.defaultAddress).toEqual(address)
    // pais is "Brasil", a name, not an ISO code.
    expect(c.defaultAddress?.country).toBeUndefined()
  })

  it('takes the default address from the one marked principal, not the first', () => {
    const [endereco] = (CLIENTE_DETAIL as RawLojaIntegradaCliente).enderecos!
    const c = CustomerSchema.parse(
      transformCliente({
        ...(CLIENTE_DETAIL as RawLojaIntegradaCliente),
        enderecos: [
          { ...endereco, cidade: 'Campinas', principal: false },
          { ...endereco, principal: true },
        ],
      }),
    )
    expect(c.addresses?.map((a) => a.city)).toEqual(['Campinas', 'São Paulo'])
    expect(c.defaultAddress?.city).toBe('São Paulo')
  })

  it('splits nome at its first space only', () => {
    expect(splitName('Francisco Ribeiro Eller')).toEqual({
      firstName: 'Francisco',
      lastName: 'Ribeiro Eller',
    })
    expect(splitName('Cliente')).toEqual({ firstName: 'Cliente' })
    expect(splitName(null)).toEqual({})
  })

  it('drops an email that is not one', () => {
    const c = CustomerSchema.parse(
      transformCliente({
        ...(CLIENTE_LIST_OBJECT as RawLojaIntegradaCliente),
        email: 'nao-e-email',
      }),
    )
    expect(c.email).toBeUndefined()
  })
})
