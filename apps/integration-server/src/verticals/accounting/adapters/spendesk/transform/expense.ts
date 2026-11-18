/**
 * Spendesk Payable → canonical Expense
 *
 * Two documented payable shapes reach this file:
 *
 *   - `SpendeskPayable`, from GET /v1/payables/{id}
 *     (https://developer.spendesk.com/reference/v1-get-payable-by-id), used by
 *     getExpense / getInvoice / getCreditMemo.
 *   - `SpendeskSearchPayable`, from POST /v1/payables/search
 *     (https://developer.spendesk.com/reference/v1-search-payables), used by
 *     the three list methods. "A payable returned by the search endpoint.
 *     Discriminated union: either an expense or a reversal, identified by the
 *     kind field."
 *
 * Both carry the same payable `id` ("Unique payable identifier."), so a row a
 * list returns reads back through the get.
 *
 * Amounts in both are "Expressed in smallest units of the currency", so they
 * map to canonical minor units unchanged.
 *
 * Header tax is not mapped: each line carries `vatAmount` and a separate VAT
 * adjustment, and the docs say nothing about how the two combine into a
 * document total, so tax is reported per line only.
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

/** Safely convert an upstream value to a Date via toIsoDatetime. Never throws. */
export function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

// ── GET /v1/payables/{id} ─────────────────────────────────────────────────────

export interface SpendeskExpenseAccount {
  id: string
  code: string
  description: string
}

export interface SpendeskVatAccount {
  id: string
  code: string
  description: string | null
  rate: number
}

export interface SpendeskLineItemFinancial {
  grossAmount: number
  netAmount: number
  vatAmount: number
  vatAdjustmentAmount: number
}

export interface SpendeskLineItem {
  expenseAccount: SpendeskExpenseAccount | null
  vatAccount: SpendeskVatAccount | null
  financial: SpendeskLineItemFinancial | null
}

export interface SpendeskCounterparty {
  id: string
  name: string | null
  type: 'supplier' | 'employee'
  accountPayable?: {
    id: string
    generalAccountCode: string
    auxiliaryAccountCode: string
  } | null
}

export interface SpendeskPayable {
  id: string
  type: string
  currency: string
  amount: number
  functionalAmount?: number
  functionalCurrency?: string
  outstandingAmount?: number
  description?: string | null
  userId?: string
  companyId?: string
  costCenterId?: string | null
  costCenterName?: string | null
  teamId?: string | null
  teamName?: string | null
  invoiceNumber?: string | null
  creditNoteNumber?: string | null
  invoiceDueDate?: string | null
  payableDate?: string
  accountingDate?: string | null
  createdAt?: string
  exportedAt?: string | null
  bookkeepingStatus?: string
  counterparty?: SpendeskCounterparty
  lineItems?: SpendeskLineItem[]
  [key: string]: unknown
}

// ── POST /v1/payables/search ──────────────────────────────────────────────────

/** `searchPayableItemLine` — "An accounting line item with net/gross/VAT breakdown". */
export interface SpendeskSearchItemLine {
  taxAccountId?: string
  expenseAccountId?: string
  netAmount: number
  grossAmount: number
  functionalGrossAmount?: number
  vatAmount: number
  vatAdjustment: number
  analyticalFieldAssociations: unknown[]
  vatRate: number
}

export type SpendeskSearchCounterparty =
  { type: 'supplier'; supplierId: string } | { type: 'employee'; memberId: string }

export interface SpendeskSearchDocumentaryEvidence {
  type: string
  validity: unknown
  compliances?: unknown
  invoiceNumber?: string
  creditNoteNumber?: string
  referenceInvoiceNumber?: string
}

export interface SpendeskSearchPayable {
  id: string
  state: 'toPrepare' | 'toExport' | 'exported'
  amount: number
  currency: string
  functionalAmount: number
  functionalCurrency: string
  outstandingAmount?: number
  outstandingFunctionalAmount?: number
  creationDate: string
  memberId: string
  kind: 'expense' | 'reversal'
  subType: string
  description: string
  dueDate?: string
  accountPayableId?: string
  firstExportedAt?: string
  firstCreatedAt: string
  accountingDate?: string
  type: string
  allocations: unknown[]
  itemLines: SpendeskSearchItemLine[]
  documentaryEvidence?: SpendeskSearchDocumentaryEvidence
  counterparty: SpendeskSearchCounterparty
  [key: string]: unknown
}

/** The response of POST /v1/payables/search. */
export interface SpendeskSearchResponse {
  nextCursor: string | null
  referencesToRetry: string[]
  payables: SpendeskSearchPayable[]
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * The one account every line posts to, or undefined when lines disagree or
 * name none. The header account of a multi-account payable is not the first
 * line's.
 */
function soleAccount(ids: Array<string | undefined>): string | undefined {
  const distinct = new Set(ids)
  if (distinct.size !== 1) return undefined
  const [only] = distinct
  return only || undefined
}

/** Lines of a GET /v1/payables/{id} payable. */
export function mapPayableLines(items: SpendeskLineItem[] | undefined): Lineitem[] | undefined {
  if (!items?.length) return undefined
  return items.map((li) => ({
    accountId: li.expenseAccount?.id || undefined,
    accountCode: li.expenseAccount?.code || undefined,
    taxAmount: li.financial ? li.financial.vatAmount : undefined,
    totalAmount: li.financial ? li.financial.grossAmount : undefined,
    notes: li.expenseAccount?.description || undefined,
  }))
}

export function payableAccountId(raw: SpendeskPayable): string | undefined {
  return raw.lineItems?.length
    ? soleAccount(raw.lineItems.map((li) => li.expenseAccount?.id))
    : undefined
}

/** Lines of a search payable (`itemLines`). */
export function mapSearchLines(
  items: SpendeskSearchItemLine[] | undefined,
): Lineitem[] | undefined {
  if (!items?.length) return undefined
  return items.map((li) => ({
    accountId: li.expenseAccountId || undefined,
    taxAmount: li.vatAmount,
    totalAmount: li.grossAmount,
  }))
}

export function searchAccountId(raw: SpendeskSearchPayable): string | undefined {
  return raw.itemLines?.length
    ? soleAccount(raw.itemLines.map((li) => li.expenseAccountId))
    : undefined
}

/** The counterparty's id: a supplier's `supplierId`, an employee's `memberId`. */
export function searchContactId(raw: SpendeskSearchPayable): string | undefined {
  const cp = raw.counterparty
  if (!cp) return undefined
  return (cp.type === 'supplier' ? cp.supplierId : cp.memberId) || undefined
}

// ── Payment method mapping (GET payable `type`) ───────────────────────────────

function mapPaymentMethod(type: string): string {
  const MAP: Record<string, string> = {
    expenseClaim: 'EXPENSE_CLAIM',
    invoicePurchase: 'INVOICE',
    creditNote: 'CREDIT_NOTE',
    singlePurchaseCard: 'CARD',
    multiUseCard: 'CARD',
    subscriptionCard: 'CARD',
    physicalCard: 'CARD',
    mileageAllowance: 'MILEAGE',
    perDiemAllowance: 'PER_DIEM',
    reverseBill: 'REFUND',
  }
  return MAP[type] ?? type
}

// ── Transforms ────────────────────────────────────────────────────────────────

/** GET /v1/payables/{id} → Expense */
export function transformPayable(raw: SpendeskPayable): Expense {
  return {
    id: raw.id || undefined,
    userId: raw.userId || undefined,
    contactId: raw.counterparty?.id || undefined,
    accountId: payableAccountId(raw),
    currency: raw.currency || undefined,
    paymentMethod: raw.type ? mapPaymentMethod(raw.type) : undefined,
    totalAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
    lineItems: mapPayableLines(raw.lineItems),
    postedAt: toDate(raw.payableDate),
    createdAt: toDate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * POST /v1/payables/search → Expense
 *
 *   userId        ← memberId        "ID of the team member who owns this payable."
 *   paymentMethod ← subType         "Payment method or expense origin."
 *   postedAt      ← creationDate    "Issue date of the payable"
 *   createdAt     ← firstCreatedAt  "Original creation timestamp"
 */
export function transformSearchPayable(raw: SpendeskSearchPayable): Expense {
  return {
    id: raw.id || undefined,
    userId: raw.memberId || undefined,
    contactId: searchContactId(raw),
    accountId: searchAccountId(raw),
    currency: raw.currency || undefined,
    paymentMethod: raw.subType || undefined,
    totalAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
    lineItems: mapSearchLines(raw.itemLines),
    postedAt: toDate(raw.creationDate),
    createdAt: toDate(raw.firstCreatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
