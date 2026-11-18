import { toCalendarDate } from '../../shared/transform'
/**
 * Yuki sales invoice transform.
 *
 * Yuki invoices are submitted via ProcessSalesInvoices (SOAP/XML) and there
 * is no list/get endpoint in the SOAP API — all invoice management happens via
 * the Yuki portal.  The transform here serves write (createInvoice) only:
 * `untransformInvoice` converts a canonical Invoice into the Yuki XML payload.
 *
 * Yuki Sales XML namespace:
 *   urn:xmlns:http://www.theyukicompany.com:salesinvoices
 */

import type { Invoice } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Yuki raw types ────────────────────────────────────────────────────────────

export interface YukiInvoiceLine {
  Description: string
  ProductQuantity: number
  SalesPrice: number
  VATPercentage: number
  VATIncluded: boolean
  LineAmount?: number
  GLAccountCode?: string
  [key: string]: unknown
}

export interface YukiContact {
  ContactCode?: string
  FullName?: string
  EmailAddress?: string
  CountryCode?: string
  City?: string
  Zipcode?: string
  AddressLine_1?: string
  AddressLine_2?: string
  VATNumber?: string
}

/** Flat record parsed from the ProcessSalesInvoices SOAP response XML. */
export interface YukiInvoiceResult {
  /** Yuki-assigned invoice reference (often echoes back our Reference) */
  Reference: string
  /** Invoice date YYYY-MM-DD */
  Date: string
  /** Due date YYYY-MM-DD */
  DueDate?: string
  Currency?: string
  ContactCode?: string
  Subject?: string
  Lines: YukiInvoiceLine[]
  [key: string]: unknown
}

// ── Transform (Yuki → canonical) ─────────────────────────────────────────────

function mapLineitem(line: YukiInvoiceLine, idx: number): Lineitem {
  const qty = line.ProductQuantity ?? 1
  const price = line.SalesPrice ?? 0
  const vatPct = line.VATPercentage ?? 0
  const netTotal = line.LineAmount ?? price * qty
  const taxAmount = netTotal * (vatPct / 100)
  return {
    id: String(idx + 1),
    accountId: line.GLAccountCode || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: price,
    unitQuantity: qty,
    totalAmount: netTotal + taxAmount,
    taxAmount: taxAmount || undefined,
  }
}

export function transformInvoice(raw: YukiInvoiceResult): Invoice {
  const lines = raw.Lines ?? []
  const totalAmount = lines.reduce((acc, l) => {
    const qty = l.ProductQuantity ?? 1
    const price = l.SalesPrice ?? 0
    const net = l.LineAmount ?? price * qty
    const vat = net * ((l.VATPercentage ?? 0) / 100)
    return acc + net + vat
  }, 0)

  return {
    id: raw.Reference || undefined,
    type: 'INVOICE',
    status: 'AUTHORIZED',
    invoiceNumber: raw.Reference || undefined,
    contactId: raw.ContactCode || undefined,
    currency: raw.Currency || undefined,
    totalAmount,
    notes: raw.Subject || undefined,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → Yuki XML) ───────────────────────────────────────

function escXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dateStr(d?: string | Date): string {
  // Accepts the canonical `Date | 'YYYY-MM-DD'` union: a date-only source keeps
  // its precision rather than being widened to a fabricated UTC instant.
  return toCalendarDate(d) ?? ''
}

/**
 * Build the XML document body for ProcessSalesInvoices.
 * Caller wraps this in the SOAP envelope via YukiSoapClient.
 */
export function untransformInvoice(invoice: Partial<Invoice>, administrationId: string): string {
  const lines = (invoice.lineItems ?? [])
    .map((li) => {
      const qty = li.unitQuantity ?? 1
      const price = li.unitAmount ?? 0
      const vatPct = 0 // caller must set tax rate; Yuki defaults to 21% if omitted
      const glCode = li.accountId ? `<GLAccountCode>${escXml(li.accountId)}</GLAccountCode>` : ''
      return `    <InvoiceLine>
      <Product>
        <Description>${escXml(li.itemDescription ?? li.itemName ?? '')}</Description>
        <SalesPrice>${price}</SalesPrice>
        <VATPercentage>${vatPct}</VATPercentage>
        <VATIncluded>false</VATIncluded>
        ${glCode}
      </Product>
      <ProductQuantity>${qty}</ProductQuantity>
    </InvoiceLine>`
    })
    .join('\n')

  const contactBlock = invoice.contactId
    ? `  <Contact>\n    <ContactCode>${escXml(invoice.contactId)}</ContactCode>\n  </Contact>`
    : ''

  return `<?xml version="1.0" encoding="utf-8"?>
<SalesInvoices xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns="urn:xmlns:http://www.theyukicompany.com:salesinvoices"
               xsi:schemaLocation="urn:xmlns:http://www.theyukicompany.com:salesinvoices salesinvoices.xsd">
  <SalesInvoice>
    <AdministrationID>${escXml(administrationId)}</AdministrationID>
    <Reference>${escXml(invoice.invoiceNumber ?? invoice.reference ?? '')}</Reference>
    <Subject>${escXml(invoice.notes ?? '')}</Subject>
    <Date>${dateStr(invoice.postedAt)}</Date>
    <DueDate>${dateStr(invoice.dueAt)}</DueDate>
    <Currency>${escXml(invoice.currency ?? 'EUR')}</Currency>
    <Process>true</Process>
${contactBlock}
    <InvoiceLines>
${lines}
    </InvoiceLines>
  </SalesInvoice>
</SalesInvoices>`
}
