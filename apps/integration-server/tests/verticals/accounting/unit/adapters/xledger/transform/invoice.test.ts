/**
 * Fixtures are the "Customer invoices" article's example response nodes
 * (https://xledgerukinternal.zendesk.com/hc/en-us/articles/8703588077330),
 * "Fully refunded/credited": the invoice node and its credit-note node.
 */
import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice } from '../../../../../../../src/verticals/accounting/adapters/xledger/transform/invoice'
import type { XledgerSubledgerTransaction } from '../../../../../../../src/verticals/accounting/adapters/xledger/relay'

const INVOICE_B: XledgerSubledgerTransaction = {
  dbId: 139977188,
  invoiceNumber: 'B',
  invoiceRemaining: '0.0000',
  invoiceAmount: '200.0000',
  reconciled: true,
  extIdentifier: '1000239',
}

describe('transformInvoice (Xledger arTransactions node)', () => {
  it('maps the documented node to a canonical invoice', () => {
    const result = InvoiceSchema.parse(transformInvoice(INVOICE_B))
    expect(result.id).toBe('139977188')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('B')
  })

  it('invents no money, currency or status the node does not document', () => {
    const result = transformInvoice(INVOICE_B)
    expect(result.currency).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.balanceAmount).toBeUndefined()
    expect(result.status).toBeUndefined()
  })

  it('keeps the raw node, amounts included, as metadata', () => {
    const result = transformInvoice(INVOICE_B)
    expect(result.metadata).toBe(INVOICE_B)
    expect(result.metadata?.['invoiceAmount']).toBe('200.0000')
  })

  it('omits an empty invoice number', () => {
    const result = InvoiceSchema.parse(transformInvoice({ ...INVOICE_B, invoiceNumber: null }))
    expect(result.invoiceNumber).toBeUndefined()
  })
})
