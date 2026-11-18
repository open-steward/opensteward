/**
 * Foreign keys must resolve back to the contact they name.
 *
 * Fortnox merges `/customers` and `/suppliers` into one canonical Contact list,
 * so `transformCustomer`/`transformSupplier` prefix the id (`cust_1`, `supp_1`)
 * to stop customer #1 colliding with supplier #1 — and `getContact` dispatches
 * on that prefix. But every document transform emitted the BARE upstream number
 * as `contactId`, so `get_accounting_contacts(id=invoice.contactId)` looked up
 * `"1"`, found nothing, and returned no error. A silent dangling reference on
 * the single join an accounting aggregator exists to serve.
 *
 * The canonical schema already specified the contract that was being broken:
 * `Contact.id`'s example is `cus_4Qm2Xa9Lr` and every `contactId` field carries
 * the identical example.
 *
 * Direction is per-entity, and is a property of the document type rather than
 * anything in the payload: an invoice/credit memo/order/sales order names a
 * CUSTOMER, a bill/purchase order names a SUPPLIER.
 *
 * The write direction is covered here too. `untransform*` sends the id back to
 * Fortnox, which has never heard of `cust_`; prefixing reads without stripping
 * writes would start posting ids the platform cannot resolve.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../src/verticals/accounting/schema/contact'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import { BillSchema } from '../../../../../../src/verticals/accounting/schema/bill'
import {
  transformCustomer,
  transformSupplier,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/contact'
import {
  transformInvoice,
  untransformInvoice,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/invoice'
import { transformBill } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/bill'
import {
  transformCreditMemo,
  untransformCreditMemo,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/creditmemo'
import {
  transformOrder,
  untransformOrder,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/order'
import {
  transformSalesOrder,
  untransformSalesOrder,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/salesorder'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/purchaseorder'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('Fortnox contact ids and the FKs that point at them', () => {
  it('resolves an invoice to its customer', () => {
    const contact = transformCustomer({ CustomerNumber: '1', Name: 'ACME Ltd' } as any)
    const invoice = transformInvoice({ DocumentNumber: '1', CustomerNumber: '1' } as any)

    expect(invoice.contactId).toBe(contact.id)
    expect(invoice.contactId).toBe('cust_1')
    // The prefixed id must still satisfy the canonical schema on both sides —
    // ExternalId rejects empty strings, so a mis-built prefix shows up here.
    expect(() => ContactSchema.parse(contact)).not.toThrow()
    expect(() => InvoiceSchema.parse(invoice)).not.toThrow()
  })

  it('resolves a bill to its supplier', () => {
    const contact = transformSupplier({ SupplierNumber: '1', Name: 'Leverantör AB' } as any)
    const bill = transformBill({ GivenNumber: 'B1', SupplierNumber: '1' } as any)

    expect(bill.contactId).toBe(contact.id)
    expect(bill.contactId).toBe('supp_1')
    expect(() => ContactSchema.parse(contact)).not.toThrow()
    expect(() => BillSchema.parse(bill)).not.toThrow()
  })

  it('does not collide a customer and a supplier sharing an upstream number', () => {
    const customer = transformCustomer({ CustomerNumber: '1' } as any)
    const supplier = transformSupplier({ SupplierNumber: '1' } as any)
    expect(customer.id).not.toBe(supplier.id)
  })

  it.each([
    ['credit memo', () => transformCreditMemo({ DocumentNumber: '1', CustomerNumber: '7' } as any)],
    ['order', () => transformOrder({ DocumentNumber: '1', CustomerNumber: '7' } as any)],
    ['sales order', () => transformSalesOrder({ DocumentNumber: '1', CustomerNumber: '7' } as any)],
  ])('points a %s at a customer', (_label, run) => {
    expect(run().contactId).toBe('cust_7')
  })

  it('points a purchase order at a supplier', () => {
    const po = transformPurchaseOrder({ DocumentNumber: 'PO1', SupplierNumber: '7' } as any)
    expect(po.contactId).toBe('supp_7')
  })

  it('leaves the FK absent when the document names no counterparty', () => {
    expect(transformInvoice({ DocumentNumber: '1' } as any).contactId).toBeUndefined()
    expect(transformBill({ GivenNumber: 'B1' } as any).contactId).toBeUndefined()
  })
})

describe('Fortnox write paths send the platform-native id', () => {
  it('strips the customer prefix on invoice create', () => {
    const body = untransformInvoice({ contactId: 'cust_1' } as any) as any
    expect(body.CustomerNumber).toBe('1')
  })

  it('strips the customer prefix on credit memo, order and sales order create', () => {
    expect((untransformCreditMemo({ contactId: 'cust_2' } as any) as any).CustomerNumber).toBe('2')
    expect((untransformOrder({ contactId: 'cust_3' } as any) as any).CustomerNumber).toBe('3')
    expect((untransformSalesOrder({ contactId: 'cust_4' } as any) as any).CustomerNumber).toBe('4')
  })

  it('strips the supplier prefix on purchase order create', () => {
    const body = untransformPurchaseOrder({ contactId: 'supp_5' } as any) as any
    expect(body.SupplierNumber).toBe('5')
  })

  it('still accepts a bare id, so a caller using platform-native ids keeps working', () => {
    expect((untransformInvoice({ contactId: '9' } as any) as any).CustomerNumber).toBe('9')
  })

  it('round-trips: read then write returns the original upstream number', () => {
    const invoice = transformInvoice({ DocumentNumber: '1', CustomerNumber: '42' } as any)
    const body = untransformInvoice(invoice) as any
    expect(body.CustomerNumber).toBe('42')
  })
})
