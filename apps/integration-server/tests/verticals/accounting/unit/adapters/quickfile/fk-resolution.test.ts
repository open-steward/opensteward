/**
 * Same defect as Fortnox, half-applied: quickfile prefixes both contact ids
 * (`transform/contact.ts:50,79`) and correctly prefixes the supplier FK on
 * bills, but emitted a BARE id for the customer FK on invoices and credit
 * memos. It was masked because `getContact` falls back to treating an
 * unprefixed value as a client id, so the detail call happened to work while
 * an equality join against `Contact.id` still failed.
 *
 * The write path is the sharper edge here: it does `Number(invoice.contactId)`,
 * so prefixing reads without stripping writes would post `NaN` upstream.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../src/verticals/accounting/schema/contact'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformClient,
  transformSupplier,
} from '../../../../../../src/verticals/accounting/adapters/quickfile/transform/contact'
import {
  transformInvoice,
  untransformInvoice,
} from '../../../../../../src/verticals/accounting/adapters/quickfile/transform/invoice'
import { transformCreditMemo } from '../../../../../../src/verticals/accounting/adapters/quickfile/transform/creditmemo'
import { transformBill } from '../../../../../../src/verticals/accounting/adapters/quickfile/transform/bill'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('quickfile FK resolution', () => {
  it('resolves an invoice to its client', () => {
    const contact = transformClient({ ClientID: 12 } as any)
    const invoice = transformInvoice({ InvoiceID: 1, ClientID: 12 } as any)
    expect(invoice.contactId).toBe(contact.id)
    expect(invoice.contactId).toBe('cust_12')
    expect(() => ContactSchema.parse(contact)).not.toThrow()
    expect(() => InvoiceSchema.parse(invoice)).not.toThrow()
  })

  it('resolves a credit memo to its client', () => {
    expect(transformCreditMemo({ InvoiceID: 1, ClientID: 12 } as any).contactId).toBe('cust_12')
  })

  it('keeps the already-correct supplier FK on bills', () => {
    const contact = transformSupplier({ SupplierID: 5 } as any)
    expect(transformBill({ InvoiceID: 2, SupplierID: 5 } as any).contactId).toBe(contact.id)
  })

  it('sends a numeric ClientID upstream, not NaN', () => {
    const body = untransformInvoice({ contactId: 'cust_12' } as any) as any
    expect(body.ClientID).toBe(12)
    expect(Number.isNaN(body.ClientID)).toBe(false)
  })
})
