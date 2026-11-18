/**
 * Fixtures are the example response nodes of "Create or update customer"
 * (https://xledgerukinternal.zendesk.com/hc/en-us/articles/8681708023698) and
 * "Create or update supplier"
 * (https://xledgerukinternal.zendesk.com/hc/en-us/articles/8674660344338).
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type XledgerContact,
} from '../../../../../../../src/verticals/accounting/adapters/xledger/transform/contact'

const CUSTOMER: XledgerContact = {
  code: 'code',
  dbId: 12345678,
  description: 'description',
  companyDbId: 22345678,
}

const SUPPLIER: XledgerContact = {
  code: 'code',
  dbId: 12345678,
  description: 'description',
}

describe('transformContact (Xledger customers / suppliers node)', () => {
  it('maps a customer node, naming its register in the id', () => {
    const result = ContactSchema.parse(transformContact(CUSTOMER, 'customer'))
    expect(result.id).toBe('cust_12345678')
    expect(result.name).toBe('description')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps a supplier node, naming its register in the id', () => {
    const result = ContactSchema.parse(transformContact(SUPPLIER, 'supplier'))
    expect(result.id).toBe('supp_12345678')
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('a customer and a supplier with one dbId get different ids', () => {
    expect(transformContact(CUSTOMER, 'customer').id).not.toBe(
      transformContact(SUPPLIER, 'supplier').id,
    )
  })

  it('does not read the customer code as an organisation number, nor guess activity', () => {
    const result = transformContact(CUSTOMER, 'customer')
    expect(result.identification).toBeUndefined()
    expect(result.isActive).toBeUndefined()
    expect(result.metadata).toBe(CUSTOMER)
  })
})
