import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type IfirmaKontrahent,
} from '../../../../../../../src/verticals/accounting/adapters/ifirma/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<IfirmaKontrahent> = {}): IfirmaKontrahent {
  return {
    Identyfikator: 'KONT-001',
    Nazwa: 'Firma ABC Sp. z o.o.',
    NIP: '123-456-78-90',
    Ulica: 'ul. Marszałkowska 10',
    KodPocztowy: '00-001',
    Miejscowosc: 'Warszawa',
    Email: 'abc@firma.pl',
    Telefon: '+48 22 123 4567',
    OsobaFizyczna: false,
    ZgodaNaEfaktury: true,
    JestDostawca: false,
    JestOdbiorca: true,
    ...overrides,
  }
}

describe('transformContact (ifirma)', () => {
  it('maps Identyfikator to id', () => {
    expect(transformContact(makeContact()).id).toBe('KONT-001')
  })

  it('maps Nazwa to name', () => {
    expect(transformContact(makeContact()).name).toBe('Firma ABC Sp. z o.o.')
  })

  it('maps NIP to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('123-456-78-90')
  })

  it('maps JestOdbiorca to isCustomer', () => {
    expect(transformContact(makeContact({ JestOdbiorca: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ JestOdbiorca: false })).isCustomer).toBe(false)
  })

  it('maps JestDostawca to isSupplier', () => {
    expect(transformContact(makeContact({ JestDostawca: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ JestDostawca: false })).isSupplier).toBe(false)
  })

  it('maps Ulica to billingAddress.address1', () => {
    expect(transformContact(makeContact()).billingAddress?.address1).toBe('ul. Marszałkowska 10')
  })

  it('maps Miejscowosc to billingAddress.city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Warszawa')
  })

  it('maps KodPocztowy to billingAddress.postalCode', () => {
    expect(transformContact(makeContact()).billingAddress?.postalCode).toBe('00-001')
  })

  it('maps Email to emails array', () => {
    const emails = transformContact(makeContact()).emails
    expect(emails?.[0]?.email).toBe('abc@firma.pl')
  })

  it('maps Telefon to telephones array', () => {
    const tels = transformContact(makeContact()).telephones
    expect(tels?.[0]?.telephone).toBe('+48 22 123 4567')
    expect(tels?.[0]?.type).toBe('WORK')
  })

  it('produces a schema-valid Contact', () => {
    expect(() => ContactSchema.parse(transformContact(makeContact()))).not.toThrow()
  })

  describe('untransformContact', () => {
    it('maps name to Nazwa', () => {
      const body = untransformContact({ name: 'Test Co' })
      expect(body['Nazwa']).toBe('Test Co')
    })

    it('maps taxNumber to NIP', () => {
      const body = untransformContact({ taxNumber: '999-888-77-66' })
      expect(body['NIP']).toBe('999-888-77-66')
    })

    it('maps isCustomer to JestOdbiorca', () => {
      expect(untransformContact({ isCustomer: true })['JestOdbiorca']).toBe(true)
      expect(untransformContact({ isCustomer: false })['JestOdbiorca']).toBe(false)
    })
  })
})
