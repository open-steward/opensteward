/**
 * Bind ERP → canonical Expense transform.
 *
 * Source: GET /api/Expenses/{id}
 *
 * In Bind ERP the "Expense" (orden de gasto) represents a supplier
 * purchase/bill document.  The API only exposes a get-by-id endpoint;
 * there is no paginated list endpoint for expenses.
 *
 * Bind ERP ExpenseDetails fields (SDK v1):
 *   ID, ProviderID, ProviderName, Status, StatusCode,
 *   CreationDate, CreditDays, LocationID, ClientID, DepartmentID,
 *   DocumentType, DocumentNumber, Comments,
 *   VAT, IEPS, VATRetention, ISRRetention, Discount,
 *   CurrencyID, CurrencyName, ExchangeRate,
 *   UUID, Series, FiscalID, RFC,
 *   ExpensePurchaseOrderItems[]
 *
 * ExpensePurchaseOrderItem: ID, Qty, Cost, TypeID, Name,
 *   ExpensePurchaseOrderID, IndexItem, SATCompanyAccountID
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

// ── Raw Bind ERP types ──────────────────────────────────────────────────────

export interface BindExpensePurchaseOrderItem {
  ID?: string
  Qty?: number
  Cost?: number
  TypeID?: string
  Name?: string
  ExpensePurchaseOrderID?: string
  IndexItem?: number
  SATCompanyAccountID?: string
  [key: string]: unknown
}

export interface BindExpenseDetails {
  ID?: string
  ProviderID?: string
  ProviderName?: string
  Status?: string
  StatusCode?: number
  CreationDate?: string
  CreditDays?: number
  LocationID?: string
  ClientID?: string
  DepartmentID?: string
  DocumentType?: number
  DocumentNumber?: string
  Comments?: string
  VAT?: number
  IEPS?: number
  VATRetention?: number
  ISRRetention?: number
  Discount?: number
  InvoiceID?: string
  CurrencyID?: string
  CurrencyName?: string
  ExchangeRate?: number
  UUID?: string
  Series?: string
  FiscalID?: string
  ISRRetType?: number
  RFC?: string
  ExpensePurchaseOrderItems?: BindExpensePurchaseOrderItem[]
  DocumentTypeText?: string
  ClientName?: string
  LocationName?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function itemToLineitem(item: BindExpensePurchaseOrderItem): Lineitem {
  const unitAmount = item.Cost ?? 0
  const qty = item.Qty ?? 1
  return {
    id: item.IndexItem !== undefined ? String(item.IndexItem) : item.ID || undefined,
    itemId: item.TypeID || undefined,
    itemName: item.Name || undefined,
    unitAmount,
    unitQuantity: Math.round(qty),
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformExpense(raw: BindExpenseDetails): Expense {
  const items = raw.ExpensePurchaseOrderItems ?? []
  const subtotal = items.reduce((acc, i) => acc + (i.Cost ?? 0) * (i.Qty ?? 1), 0)
  const taxAmount = (raw.VAT ?? 0) + (raw.IEPS ?? 0) - (raw.VATRetention ?? 0) - (raw.ISRRetention ?? 0)
  const totalAmount = subtotal - (raw.Discount ?? 0) + taxAmount

  return {
    id: raw.ID || raw.UUID || '',
    name: raw.DocumentNumber || raw.DocumentTypeText || undefined,
    accountId: raw.LocationID || undefined,
    contactId: raw.ProviderID || raw.ClientID || undefined,
    currency: raw.CurrencyName || raw.CurrencyID || undefined,
    taxAmount: taxAmount || undefined,
    totalAmount: totalAmount || undefined,
    lineItems: items.length ? items.map(itemToLineitem) : undefined,
    postedAt: raw.CreationDate ? new Date(raw.CreationDate) : undefined,
    createdAt: raw.CreationDate ? new Date(raw.CreationDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
