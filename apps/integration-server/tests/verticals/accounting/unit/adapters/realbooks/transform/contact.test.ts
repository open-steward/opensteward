import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RealBooksLedger,
} from '../../../../../../../src/verticals/accounting/adapters/realbooks/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomerLedger(overrides: Partial<RealBooksLedger> = {}): RealBooksLedger {
  return {
    id: 201,
    ledgerName: 'Widget Co',
    printName: 'Widget Co Ltd',
    ledgerCode: 'CUST-201',
    ledgerGroupName: 'Sundry Debtors',
    groupNature: 'Asset',
    gstin: 'GSTIN1234567890',
    partyDet: {
      contactPerson: 'Jane Smith',
      address: '1 Main Street',
      phone: '+91 9876543210',
      email: 'jane@widget.co',
      gstin: 'GSTIN1234567890',
      pan: 'ABCDE1234F',
      city: 'Mumbai',
      pinCode: '400001',
      stateName: 'Maharashtra',
      country: 'IN',
    },
    ...overrides,
  }
}

function makeSupplierLedger(overrides: Partial<RealBooksLedger> = {}): RealBooksLedger {
  return {
    id: 301,
    ledgerName: 'Steel Suppliers Ltd',
    printName: 'Steel Suppliers',
    ledgerCode: 'SUPP-301',
    ledgerGroupName: 'Sundry Creditors',
    groupNature: 'Liability',
    gstin: 'GSTIN9876543210',
    ...overrides,
  }
}

describe('transformContact (customer)', () => {
  it('maps id as string', () => {
    expect(transformContact(makeCustomerLedger()).id).toBe('201')
  })

  it('falls back to ledgerCode when id is absent', () => {
    expect(transformContact(makeCustomerLedger({ id: undefined })).id).toBe('CUST-201')
  })

  it('maps printName to name', () => {
    expect(transformContact(makeCustomerLedger()).name).toBe('Widget Co Ltd')
  })

  it('maps ledgerName to companyName', () => {
    expect(transformContact(makeCustomerLedger()).companyName).toBe('Widget Co')
  })

  it('maps gstin to taxNumber', () => {
    expect(transformContact(makeCustomerLedger()).taxNumber).toBe('GSTIN1234567890')
  })

  it('maps ledgerCode to identification', () => {
    expect(transformContact(makeCustomerLedger()).identification).toBe('CUST-201')
  })

  it('sets isCustomer=true for Sundry Debtors group', () => {
    expect(transformContact(makeCustomerLedger()).isCustomer).toBe(true)
  })

  it('sets isSupplier=false for Sundry Debtors group', () => {
    expect(transformContact(makeCustomerLedger()).isSupplier).toBe(false)
  })

  it('maps partyDet.email to emails array', () => {
    const result = transformContact(makeCustomerLedger())
    expect(result.emails?.[0].email).toBe('jane@widget.co')
    expect(result.emails?.[0].type).toBe('WORK')
  })

  it('maps partyDet.phone to telephones array with WORK type', () => {
    const result = transformContact(makeCustomerLedger())
    expect(result.telephones?.[0].telephone).toBe('+91 9876543210')
    expect(result.telephones?.[0].type).toBe('WORK')
  })

  it('maps billing address from partyDet', () => {
    const result = transformContact(makeCustomerLedger())
    expect(result.billingAddress?.address1).toBe('1 Main Street')
    expect(result.billingAddress?.city).toBe('Mumbai')
    expect(result.billingAddress?.country).toBe('IN')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomerLedger()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces output that passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeCustomerLedger()))).not.toThrow()
  })
})

describe('transformContact (supplier)', () => {
  it('sets isSupplier=true for Sundry Creditors group', () => {
    expect(transformContact(makeSupplierLedger()).isSupplier).toBe(true)
  })

  it('sets isCustomer=false for Sundry Creditors group', () => {
    expect(transformContact(makeSupplierLedger()).isCustomer).toBe(false)
  })

  it('produces output that passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeSupplierLedger()))).not.toThrow()
  })
})

describe('untransformContact', () => {
  it('round-trips name back to ledgerName', () => {
    const contact = transformContact(makeCustomerLedger())
    const raw = untransformContact(contact)
    expect(raw['ledgerName']).toBe('Widget Co Ltd')
  })

  it('sets ledgerGroupName to Sundry Debtors for customer', () => {
    const contact = transformContact(makeCustomerLedger())
    const raw = untransformContact(contact)
    expect(raw['ledgerGroupName']).toBe('Sundry Debtors')
  })

  it('sets ledgerGroupName to Sundry Creditors for supplier', () => {
    const contact = transformContact(makeSupplierLedger())
    const raw = untransformContact(contact)
    expect(raw['ledgerGroupName']).toBe('Sundry Creditors')
  })
})
