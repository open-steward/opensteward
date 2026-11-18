import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/ecommerce/adapters/sana-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

describe('transformCustomer', () => {
  it('maps Id to id (stringified)', () => {
    const result = transformCustomer({ Id: 42, Email: 'a@b.com' })
    expect(result.id).toBe('42')
    expect(result.email).toBe('a@b.com')
  })

  it('maps camelCase id and email', () => {
    const result = transformCustomer({ id: 'cust-camel', email: 'camel@example.com' })
    expect(result.id).toBe('cust-camel')
    expect(result.email).toBe('camel@example.com')
  })

  it('maps FirstName and LastName to firstName and lastName', () => {
    const result = transformCustomer({ Id: '1', FirstName: 'Jane', LastName: 'Doe' })
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps camelCase firstName and lastName', () => {
    const result = transformCustomer({ Id: '2', firstName: 'John', lastName: 'Smith' })
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
  })

  it('splits Name into firstName and lastName when FirstName/LastName are absent', () => {
    const result = transformCustomer({ Id: '3', Name: 'Alice Wonder' })
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Wonder')
  })

  it('puts single-word Name entirely into firstName', () => {
    const result = transformCustomer({ Id: '4', Name: 'Acme' })
    expect(result.firstName).toBe('Acme')
    expect(result.lastName).toBeUndefined()
  })

  it('maps TotalOrderAmount via majorToMinor to totalSpent', () => {
    const result = transformCustomer({
      Id: '5',
      Email: 'big@spender.com',
      TotalOrderAmount: 500.0,
      Currency: 'EUR',
    })
    expect(result.totalSpent?.amount).toBe(50000)
    expect(result.totalSpent?.currency).toBe('EUR')
  })

  it('maps camelCase totalOrderAmount', () => {
    const result = transformCustomer({
      Id: '6',
      totalOrderAmount: 250.5,
      currency: 'USD',
    })
    expect(result.totalSpent?.amount).toBe(25050)
    expect(result.totalSpent?.currency).toBe('USD')
  })

  it('omits totalSpent when TotalOrderAmount is absent', () => {
    const result = transformCustomer({ Id: '7', Email: 'no@spend.com' })
    expect(result.totalSpent).toBeUndefined()
    expect(result.id).toBe('7')
  })

  it('maps Address to defaultAddress via mapAddress', () => {
    const result = transformCustomer({
      Id: '8',
      Email: 'addr@test.com',
      Address: {
        Street: '22 Oak Ave',
        City: 'Berlin',
        ZipCode: '10115',
        CountryCode: 'DE',
      },
    })
    expect(result.defaultAddress?.line1).toBe('22 Oak Ave')
    expect(result.defaultAddress?.city).toBe('Berlin')
  })

  it('maps Address.ZipCode to postalCode and CountryCode to country', () => {
    const result = transformCustomer({
      Id: '9',
      Address: {
        Street: '1 High St',
        ZipCode: 'EC1A 1BB',
        CountryCode: 'GB',
      },
    })
    expect(result.defaultAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.defaultAddress?.country).toBe('GB')
  })

  it('maps camelCase address fields', () => {
    const result = transformCustomer({
      Id: '10',
      address: {
        street: '5 Rue de Rivoli',
        city: 'Paris',
        zipCode: '75001',
        countryCode: 'FR',
      },
    })
    expect(result.defaultAddress?.line1).toBe('5 Rue de Rivoli')
    expect(result.defaultAddress?.country).toBe('FR')
  })

  it('omits defaultAddress when all address fields are empty', () => {
    const result = transformCustomer({ Id: '11', Address: {} })
    expect(result.defaultAddress).toBeUndefined()
    expect(result.id).toBe('11')
  })

  it('maps Phone to phone', () => {
    const result = transformCustomer({ Id: '12', Phone: '+31 20 123 4567' })
    expect(result.phone).toBe('+31 20 123 4567')
    expect(result.id).toBe('12')
  })

  it('falls back to CustomerId when Id is absent', () => {
    const result = transformCustomer({ CustomerId: 'ext-cust-99', Email: 'ext@example.com' })
    expect(result.id).toBe('ext-cust-99')
    expect(result.email).toBe('ext@example.com')
  })

  it('defaults currency to EUR when Currency is absent', () => {
    const result = transformCustomer({ Id: '13', TotalOrderAmount: 100 })
    expect(result.totalSpent?.currency).toBe('EUR')
    expect(result.totalSpent?.amount).toBe(10000)
  })

  it('passes CustomerSchema.parse without throwing', () => {
    const result = transformCustomer({
      Id: 'schema-cust',
      Email: 'valid@schema.com',
      FirstName: 'Test',
      LastName: 'User',
      Phone: '+49 30 12345',
      TotalOrderAmount: 750.0,
      Currency: 'EUR',
      Address: {
        Street: '99 Test Blvd',
        City: 'Munich',
        ZipCode: '80331',
        CountryCode: 'DE',
      },
    })
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
