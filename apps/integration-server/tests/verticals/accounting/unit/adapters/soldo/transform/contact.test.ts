import { describe, it, expect } from 'vitest'
import {
  transformEmployee,
  type SoldoEmployee,
} from '../../../../../../../src/verticals/accounting/adapters/soldo/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<SoldoEmployee> = {}): SoldoEmployee {
  return {
    id: 'emp_xyz',
    name: 'Jane',
    surname: 'Doe',
    email: 'jane.doe@acme.example',
    mobile: '+447700900000',
    jobTitle: 'Finance Manager',
    department: 'Finance',
    status: 'ACTIVE',
    visible: true,
    ...overrides,
  }
}

describe('transformEmployee (soldo)', () => {
  it('maps id', () => {
    expect(transformEmployee(makeRaw()).id).toBe('emp_xyz')
  })

  it('composes full name from name + surname', () => {
    expect(transformEmployee(makeRaw()).name).toBe('Jane Doe')
  })

  it('maps firstName from name field', () => {
    expect(transformEmployee(makeRaw()).firstName).toBe('Jane')
  })

  it('maps lastName from surname field', () => {
    expect(transformEmployee(makeRaw()).lastName).toBe('Doe')
  })

  it('always sets isCustomer=false and isSupplier=false', () => {
    const result = transformEmployee(makeRaw())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(false)
  })

  it('maps ACTIVE status to isActive=true', () => {
    expect(transformEmployee(makeRaw({ status: 'ACTIVE' })).isActive).toBe(true)
  })

  it('maps PENDING status to isActive=true', () => {
    expect(transformEmployee(makeRaw({ status: 'PENDING' })).isActive).toBe(true)
  })

  it('maps INACTIVE status to isActive=false', () => {
    expect(transformEmployee(makeRaw({ status: 'INACTIVE' })).isActive).toBe(false)
  })

  it('maps email to WORK email', () => {
    const result = transformEmployee(makeRaw())
    expect(result.emails?.[0]?.email).toBe('jane.doe@acme.example')
    expect(result.emails?.[0]?.type).toBe('WORK')
  })

  it('maps mobile to MOBILE telephone', () => {
    const result = transformEmployee(makeRaw())
    expect(result.telephones?.[0]?.telephone).toBe('+447700900000')
    expect(result.telephones?.[0]?.type).toBe('MOBILE')
  })

  it('omits emails when email absent', () => {
    expect(transformEmployee(makeRaw({ email: undefined })).emails).toBeUndefined()
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformEmployee(makeRaw()))).not.toThrow()
  })
})
