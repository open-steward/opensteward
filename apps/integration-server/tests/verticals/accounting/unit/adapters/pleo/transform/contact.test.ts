import { describe, it, expect } from 'vitest'
import {
  transformEmployee,
  type PleoEmployee,
} from '../../../../../../../src/verticals/accounting/adapters/pleo/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<PleoEmployee> = {}): PleoEmployee {
  return {
    id: 'emp-42',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@company.com',
    phone: '+4412345678',
    code: 'E-042',
    jobTitle: 'Engineer',
    ...overrides,
  }
}

describe('pleo transformEmployee', () => {
  it('maps id', () => {
    expect(transformEmployee(makeRaw()).id).toBe('emp-42')
  })

  it('joins firstName and lastName into name', () => {
    expect(transformEmployee(makeRaw()).name).toBe('Jane Doe')
  })

  it('maps firstName', () => {
    expect(transformEmployee(makeRaw()).firstName).toBe('Jane')
  })

  it('maps lastName', () => {
    expect(transformEmployee(makeRaw()).lastName).toBe('Doe')
  })

  it('maps code to identification', () => {
    expect(transformEmployee(makeRaw()).identification).toBe('E-042')
  })

  it('sets isCustomer=false and isSupplier=false', () => {
    const result = transformEmployee(makeRaw())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(false)
  })

  it('sets isActive=true', () => {
    expect(transformEmployee(makeRaw()).isActive).toBe(true)
  })

  it('maps email to emails array with type WORK', () => {
    const result = transformEmployee(makeRaw())
    expect(result.emails?.[0]?.email).toBe('jane.doe@company.com')
    expect(result.emails?.[0]?.type).toBe('WORK')
  })

  it('maps phone to telephones array with type WORK', () => {
    const result = transformEmployee(makeRaw())
    expect(result.telephones?.[0]?.telephone).toBe('+4412345678')
  })

  it('name is undefined when both names absent', () => {
    expect(
      transformEmployee(makeRaw({ firstName: undefined, lastName: undefined })).name,
    ).toBeUndefined()
  })

  it('passes ContactSchema.parse', () => {
    expect(() => ContactSchema.parse(transformEmployee(makeRaw()))).not.toThrow()
  })
})
