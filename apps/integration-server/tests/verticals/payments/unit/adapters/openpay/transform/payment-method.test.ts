/**
 * Fixture: the "Objeto Tarjeta" example object
 * (https://documents.openpay.mx/docs/api/index.html).
 */
import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawOpenpayCard,
} from '../../../../../../../src/verticals/payments/adapters/openpay/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

const CUS = 'a2b79p8xmzeyvmolqfja'

const DOC: RawOpenpayCard = {
  type: 'debit',
  brand: 'mastercard',
  address: {
    line1: 'Av 5 de Febrero',
    line2: 'Roble 207',
    line3: 'col carrillo',
    state: 'Queretaro',
    city: 'Querétaro',
    postal_code: '76900',
    country_code: 'MX',
  },
  id: 'kgipbqixvjg3gbzowl7l',
  card_number: '1111',
  holder_name: 'Juan Perez Ramirez',
  expiration_year: '20',
  expiration_month: '12',
  allows_charges: true,
  allows_payouts: false,
  creation_date: '2013-12-12T17:50:00-06:00',
  bank_name: 'DESCONOCIDO',
  bank_code: '000',
  customer_id: CUS,
  points_card: true,
}

describe('openpay transformPaymentMethod', () => {
  it('maps the documented card object', () => {
    const r = PaymentMethodSchema.parse(transformPaymentMethod(DOC, CUS))
    expect(r).toMatchObject({
      id: `${CUS}:kgipbqixvjg3gbzowl7l`,
      externalId: 'kgipbqixvjg3gbzowl7l',
      customerId: CUS,
      type: 'card',
      brand: 'mastercard',
      last4: '1111',
      expMonth: 12,
      expYear: 2020,
      holderName: 'Juan Perez Ramirez',
      bankName: 'DESCONOCIDO',
      gateway: 'openpay',
      metadata: { type: 'debit', bank_code: '000' },
      createdAt: '2013-12-12T23:50:00.000Z',
    })
  })

  it('reads the documented numeric types and a four-digit year', () => {
    const r = transformPaymentMethod(
      { ...DOC, card_number: 4111111111111111, expiration_month: 7, expiration_year: 2031 },
      CUS,
    )
    expect(r).toMatchObject({ last4: '1111', expMonth: 7, expYear: 2031 })
  })

  it('drops an out-of-range month rather than guessing', () => {
    expect(transformPaymentMethod({ ...DOC, expiration_month: '13' }, CUS).expMonth).toBeUndefined()
  })

  it('throws on a record without an id', () => {
    const { id: _i, ...rest } = DOC
    expect(() => transformPaymentMethod(rest, CUS)).toThrow(/no id/)
  })
})
