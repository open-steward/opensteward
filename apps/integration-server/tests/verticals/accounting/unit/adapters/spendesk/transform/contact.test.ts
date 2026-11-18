import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  transformUser,
  type SpendeskSupplier,
  type SpendeskUser,
} from '../../../../../../../src/verticals/accounting/adapters/spendesk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeSupplierRaw(overrides: Partial<SpendeskSupplier> = {}): SpendeskSupplier {
  return {
    id: 'sup_001',
    name: 'Acme Ltd',
    ...overrides,
  }
}

function makeUserRaw(overrides: Partial<SpendeskUser> = {}): SpendeskUser {
  return {
    id: 'usr_001',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@acme.example',
    ...overrides,
  }
}

describe('transformSupplier (spendesk)', () => {
  it('maps id', () => {
    expect(transformSupplier(makeSupplierRaw()).id).toBe('sup_001')
  })

  it('maps name', () => {
    expect(transformSupplier(makeSupplierRaw()).name).toBe('Acme Ltd')
  })

  it('sets isSupplier=true', () => {
    expect(transformSupplier(makeSupplierRaw()).isSupplier).toBe(true)
  })

  it('sets isCustomer=false', () => {
    expect(transformSupplier(makeSupplierRaw()).isCustomer).toBe(false)
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeSupplierRaw()))).not.toThrow()
  })
})

describe('transformUser (spendesk)', () => {
  it('maps id', () => {
    expect(transformUser(makeUserRaw()).id).toBe('usr_001')
  })

  it('composes name from firstName + lastName', () => {
    expect(transformUser(makeUserRaw()).name).toBe('Jane Doe')
  })

  it('maps firstName', () => {
    expect(transformUser(makeUserRaw()).firstName).toBe('Jane')
  })

  it('maps lastName', () => {
    expect(transformUser(makeUserRaw()).lastName).toBe('Doe')
  })

  it('maps email to WORK email', () => {
    const result = transformUser(makeUserRaw())
    expect(result.emails?.[0]?.email).toBe('jane.doe@acme.example')
    expect(result.emails?.[0]?.type).toBe('WORK')
  })

  it('sets isCustomer=false and isSupplier=false', () => {
    const result = transformUser(makeUserRaw())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(false)
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformUser(makeUserRaw()))).not.toThrow()
  })
})
