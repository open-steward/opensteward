import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformSupplier,
  untransformSupplier,
  type BokioSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/bokio/transform/supplier'
import { SUPPLIER, SUPPLIER_SCHEMA_EXAMPLE, copyOf } from '../fixtures'

const supplier = (overrides: Partial<BokioSupplier> = {}): BokioSupplier => ({
  ...copyOf<BokioSupplier>(SUPPLIER),
  ...overrides,
})

describe('transformSupplier (Bokio [Preview] supplier)', () => {
  it('maps the documented example as a supplier contact and parses against ContactSchema', () => {
    const out = ContactSchema.parse(transformSupplier(supplier()))
    expect(out).toEqual({
      id: '12345678-abcd-1234-abcd-1234567890ab',
      name: 'Example Supplier',
      identification: '556677-8899',
      taxNumber: 'SE123456789001',
      isCustomer: false,
      isSupplier: true,
      currency: 'SEK',
      billingAddress: {
        address1: 'Älvsborgsvägen 10',
        address2: 'c/o Test',
        city: 'Gothenburg',
        postalCode: '123 45',
        country: 'SE',
      },
      metadata: SUPPLIER,
    })
  })

  it('maps the list page schema example the same way', () => {
    const out = ContactSchema.parse(
      transformSupplier(copyOf<BokioSupplier>(SUPPLIER_SCHEMA_EXAMPLE)),
    )
    expect(out).toMatchObject({ isSupplier: true, isCustomer: false, name: 'Example Supplier' })
  })

  it('leaves the address unset when none is reported', () => {
    const out = ContactSchema.parse(transformSupplier(supplier({ address: null })))
    expect(out.billingAddress).toBeUndefined()
  })

  it('keeps the raw row, with paymentDetails, as metadata', () => {
    const raw = supplier()
    expect(transformSupplier(raw).metadata).toBe(raw)
  })
})

describe('untransformSupplier (canonical → supplier body)', () => {
  it('writes name, orgNumber, vatNumber, currency and address for a new supplier', () => {
    expect(
      untransformSupplier({
        name: 'Supplier ABC',
        identification: '556677-8899',
        taxNumber: 'SE123456789001',
        currency: 'EUR',
        billingAddress: {
          address1: 'Älvsborgsvägen 10',
          city: 'Gothenburg',
          postalCode: '123 45',
          country: 'SE',
        },
      }),
    ).toEqual({
      name: 'Supplier ABC',
      orgNumber: '556677-8899',
      vatNumber: 'SE123456789001',
      currency: 'EUR',
      address: {
        line1: 'Älvsborgsvägen 10',
        line2: null,
        city: 'Gothenburg',
        postalCode: '123 45',
        country: 'SE',
      },
    })
  })

  it('lays a partial update over the current supplier, keeping paymentDetails and the address', () => {
    const body = untransformSupplier({ billingAddress: { city: 'Malmö' } }, supplier())
    expect(body).toEqual({
      name: 'Example Supplier',
      orgNumber: '556677-8899',
      vatNumber: 'SE123456789001',
      currency: 'SEK',
      address: {
        line1: 'Älvsborgsvägen 10',
        line2: 'c/o Test',
        city: 'Malmö',
        postalCode: '123 45',
        country: 'SE',
      },
      paymentDetails: { type: 'bankgiro', bankgiroNumber: '5174-8895' },
    })
    expect(body).not.toHaveProperty('id')
  })

  it.each([
    ['no name', {}],
    ['emails', { name: 'X', emails: [{ email: 'a@example.com' }] }],
    ['telephones', { name: 'X', telephones: [{ telephone: '1' }] }],
    ['a shippingAddress', { name: 'X', shippingAddress: { city: 'Lund' } }],
  ])('refuses %s with a 400', (_what, data) => {
    expect(() => untransformSupplier(data)).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }),
    )
  })
})
