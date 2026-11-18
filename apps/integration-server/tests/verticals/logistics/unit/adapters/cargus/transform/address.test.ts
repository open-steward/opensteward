import { describe, it, expect } from 'vitest'
import { transformAddress } from '../../../../../../../src/verticals/logistics/adapters/cargus/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'
import { documentedAwb } from '../fixtures/documented'

describe('cargus transformAddress (documented AWB Sender/Recipient)', () => {
  it('parses against AddressSchema', () => {
    expect(() => AddressSchema.parse(transformAddress(documentedAwb('1').Sender))).not.toThrow()
  })

  it('joins StreetName and BuildingNumber, and keeps AddressText as street2', () => {
    const a = AddressSchema.parse(transformAddress(documentedAwb('1').Sender))
    expect(a.street1).toBe('Strada Victoriei 12')
    expect(a.street2).toBe('Bloc A, ap. 3')
  })

  it('reads CodPostal, PhoneNumber, ContactPerson and Name', () => {
    const a = AddressSchema.parse(transformAddress(documentedAwb('1').Sender))
    expect(a.postalCode).toBe('010061')
    expect(a.phone).toBe('0721000001')
    expect(a.name).toBe('Ion Popescu')
    expect(a.company).toBe('Magazin SRL')
  })

  it('never maps CountryId (a Cargus nomenclature number) to country', () => {
    const a = AddressSchema.parse(transformAddress(documentedAwb('1').Recipient))
    expect(a.country).toBeUndefined()
  })

  it('an address with no street fields has no street1', () => {
    const a = AddressSchema.parse(
      transformAddress({ LocalityName: 'Iasi', StreetName: '', BuildingNumber: '' }),
    )
    expect(a.street1).toBeUndefined()
    expect(a.city).toBe('Iasi')
  })
})
