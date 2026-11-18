import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformSupplier,
  type ManagerCustomer,
  type ManagerSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<ManagerCustomer> = {}): ManagerCustomer {
  return {
    key: 'cust-key-1',
    code: 'C001',
    name: 'Acme Ltd',
    email: 'acme@example.com',
    phone: '+14155550100',
    address: '100 Main St\nSuite 200\nSan Francisco\n94105\nUS',
    status: 'Active',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<ManagerSupplier> = {}): ManagerSupplier {
  return {
    key: 'supp-key-1',
    code: 'S001',
    name: 'Widgets Inc',
    email: 'widgets@example.com',
    phone: '+442079460000',
    status: 'Active',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('prefixes key with cust_ for id', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_cust-key-1')
  })

  it('maps name', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('Acme Ltd')
  })

  it('marks isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps code to identification', () => {
    expect(transformCustomer(makeCustomer()).identification).toBe('C001')
  })

  it('maps email to emails array', () => {
    expect(transformCustomer(makeCustomer()).emails![0].email).toBe('acme@example.com')
  })

  it('maps active status to isActive=true', () => {
    expect(transformCustomer(makeCustomer({ status: 'Active' })).isActive).toBe(true)
  })

  it('maps inactive status to isActive=false', () => {
    expect(transformCustomer(makeCustomer({ status: 'Inactive' })).isActive).toBe(false)
  })

  it('parses multiline address into billingAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress?.address1).toBe('100 Main St')
    expect(result.billingAddress?.address2).toBe('Suite 200')
    expect(result.billingAddress?.city).toBe('San Francisco')
  })

  it('passes schema validation', () => {
    expect(() => ContactSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })
})

describe('transformSupplier', () => {
  it('prefixes key with supp_ for id', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('supp_supp-key-1')
  })

  it('marks isSupplier=true and isCustomer=false', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps name and email', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.name).toBe('Widgets Inc')
    expect(result.emails![0].email).toBe('widgets@example.com')
  })

  it('passes schema validation', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeSupplier()))).not.toThrow()
  })
})
