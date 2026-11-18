/** Fixture keys are CustomerModel's documented attribute names (v5.8.0 REST/Models/CustomerModel.php). */
import { describe, expect, it } from 'vitest'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import { transformCustomerModel } from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/customer-model'

const ROW = {
  id: 9,
  customerGroupID: 1,
  customerNO: 'K-9',
  password: '',
  salutation: 'w',
  firstname: 'Erika',
  surname: 'Mustermann',
  company: 'Muster GmbH',
  street: 'Hauptstraße',
  streetNO: '5',
  additionalAddress: 'Hinterhaus',
  zip: '50667',
  city: 'Köln',
  state: 'NRW',
  country: 'DE',
  tel: '+49 221 000000',
  mail: 'erika@example.de',
  created: '2026-01-15',
  modified: '2026-02-01 14:20:00',
}

describe('transformCustomerModel', () => {
  it('maps a decrypted list row and parses as a Customer', () => {
    const c = CustomerSchema.parse(transformCustomerModel(ROW, { decrypted: true }))
    expect(c).toMatchObject({
      id: '9',
      email: 'erika@example.de',
      firstName: 'Erika',
      lastName: 'Mustermann',
      phone: '+49 221 000000',
      defaultAddress: {
        line1: 'Hauptstraße 5',
        line2: 'Hinterhaus',
        city: 'Köln',
        region: 'NRW',
        postalCode: '50667',
      },
    })
    expect(c.defaultAddress?.country).toBeUndefined()
    expect(c.metadata).not.toHaveProperty('password')
  })

  it('leaves out the XTEA-encrypted fields of an undecrypted show() record', () => {
    const c = CustomerSchema.parse(
      transformCustomerModel(
        { ...ROW, surname: 'XTEA==', company: 'XTEA==', street: 'XTEA==', additional: 'XTEA==' },
        { decrypted: false },
      ),
    )
    expect(c.lastName).toBeUndefined()
    expect(c.defaultAddress?.line1).toBeUndefined()
    expect(JSON.stringify(c)).not.toContain('XTEA')
  })

  it('omits an empty or invalid mail instead of failing the row', () => {
    expect(transformCustomerModel({ ...ROW, mail: '' }, { decrypted: true }).email).toBeUndefined()
    expect(
      CustomerSchema.parse(
        transformCustomerModel({ ...ROW, mail: 'kein-mail' }, { decrypted: true }),
      ).email,
    ).toBeUndefined()
  })
})
