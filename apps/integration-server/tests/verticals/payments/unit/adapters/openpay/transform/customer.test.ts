/**
 * Fixture: the "Listado de clientes" example response
 * (https://documents.openpay.mx/docs/api/index.html).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawOpenpayCustomer,
} from '../../../../../../../src/verticals/payments/adapters/openpay/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

const DOC: RawOpenpayCustomer = {
  id: 'cpjdhf754ythr65yu9k7q',
  creation_date: '2013-11-08T12:04:46-06:00',
  name: 'Rodrigo',
  last_name: 'Velazco Perez',
  email: 'rodrigo.velazco@payments.com',
  phone_number: '4425667045',
  status: 'active',
  balance: 142.5,
  store: {
    reference: 'OPENPAY02DQ35YOY7',
    barcode_url:
      'https://sandbox-api.openpay.mx/barcode/OPENPAY02DQ35YOY7?width=1&height=45&text=false',
  },
  clabe: '646180109400423323',
}

describe('openpay transformCustomer', () => {
  it('maps the documented customer object', () => {
    const result = CustomerSchema.parse(transformCustomer(DOC))
    expect(result.id).toBe('cpjdhf754ythr65yu9k7q')
    expect(result.externalId).toBe('cpjdhf754ythr65yu9k7q')
    expect(result.name).toBe('Rodrigo Velazco Perez')
    expect(result.email).toBe('rodrigo.velazco@payments.com')
    expect(result.phone).toBe('4425667045')
    expect(result.createdAt).toBe('2013-11-08T12:04:46-06:00')
    expect(result.metadata).toEqual({ status: 'active' })
    expect(result.balance).toBeUndefined()
    expect(result.gateway).toBe('openpay')
  })

  it('omits optional fields that are absent', () => {
    const result = CustomerSchema.parse(transformCustomer({ id: 'c1', name: 'Solo' }))
    expect(result.name).toBe('Solo')
    expect(result.email).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.metadata).toEqual({})
  })

  it('throws on a record without an id', () => {
    expect(() => transformCustomer({ name: 'x' })).toThrow(/no id/)
  })

  it('reads phone_number, documented as numeric, as a number too', () => {
    expect(transformCustomer({ id: 'c1', phone_number: 4425667045 }).phone).toBe('4425667045')
  })
})
