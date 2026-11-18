/**
 * Docs: https://developers.tray.com.br/ `#listagem-de-clientes-get`,
 * `#consultar-dados-do-cliente-get`, `#cadastrar-cliente-post` — fetched
 * with curl; see `transform/customer.ts` header for the confirmed fields.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawTrayCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/tray-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawTrayCustomer> = {}): RawTrayCustomer {
  return {
    id: '123',
    name: 'Nome do Cliente',
    email: 'emaildo@cliente.com.br',
    phone: '1133330000',
    cellphone: '11999990000',
    created: '2008-10-14 18:17:23',
    modified: '2016-08-15 18:17:23',
    ...overrides,
  }
}

describe('transformCustomer (Tray Commerce)', () => {
  it('maps id and email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('123')
    expect(result.email).toBe('emaildo@cliente.com.br')
  })

  it('splits `name` into firstName/lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Nome')
    expect(result.lastName).toBe('do Cliente')
  })

  it('handles a single-word name', () => {
    const result = transformCustomer(makeCustomer({ name: 'Madonna' }))
    expect(result.firstName).toBe('Madonna')
    expect(result.lastName).toBeUndefined()
  })

  it('prefers `phone`, falling back to `cellphone` — both are documented fields', () => {
    expect(transformCustomer(makeCustomer()).phone).toBe('1133330000')
    expect(transformCustomer(makeCustomer({ phone: undefined })).phone).toBe('11999990000')
  })

  it('does not map created/modified — documented but space-separated with no timezone, which IsoDatetime rejects', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })

  it('round-trips name, email and phone via untransformCustomer', () => {
    const customer = transformCustomer(makeCustomer())
    const body = untransformCustomer(customer)
    expect(body['name']).toBe('Nome do Cliente')
    expect(body['email']).toBe('emaildo@cliente.com.br')
    expect(body['phone']).toBe('1133330000')
  })
})
