/**
 * Yuki transaction transform.
 *
 * Transactions come from AccountingInfo.asmx → GetTransactionDetails which
 * returns XML with <TransactionInfo> elements for a given GL account + date range.
 *
 * Known fields from the PHP client (AccountInfoClient.php):
 *   TransactionID       — unique transaction identifier
 *   GLAccountCode       — GL account code
 *   Date                — transaction date YYYY-MM-DD
 *   Description         — transaction description
 *   Amount              — signed decimal amount (positive = debit)
 *   Reference           — reference/document number
 *   ContactCode         — associated contact code
 *   ContactName         — associated contact name
 *   Currency            — currency code (default EUR)
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { extractFirst, extractBlocks, unescapeXml } from '../client'

// ── Yuki raw type (parsed from SOAP XML) ─────────────────────────────────────

export interface YukiTransactionInfo {
  TransactionID: string
  GLAccountCode: string
  Date: string
  Description: string
  Amount: string
  Reference: string
  ContactCode: string
  ContactName: string
  Currency: string
  [key: string]: unknown
}

// ── XML → YukiTransactionInfo[] ──────────────────────────────────────────────

export function parseTransactionsXml(innerXml: string): YukiTransactionInfo[] {
  const blocks = extractBlocks(innerXml, 'TransactionInfo')
  return blocks.map((block) => ({
    TransactionID: unescapeXml(extractFirst(block, 'TransactionID')),
    GLAccountCode: unescapeXml(extractFirst(block, 'GLAccountCode')),
    Date: unescapeXml(extractFirst(block, 'Date')),
    Description: unescapeXml(extractFirst(block, 'Description')),
    Amount: unescapeXml(extractFirst(block, 'Amount')),
    Reference: unescapeXml(extractFirst(block, 'Reference')),
    ContactCode: unescapeXml(extractFirst(block, 'ContactCode')),
    ContactName: unescapeXml(extractFirst(block, 'ContactName')),
    Currency: unescapeXml(extractFirst(block, 'Currency')),
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: YukiTransactionInfo): Transaction {
  const amount = raw.Amount ? parseFloat(raw.Amount) : 0
  const contacts: TransactionContact[] = []
  if (raw.ContactCode || raw.ContactName) {
    contacts.push({ id: raw.ContactCode || undefined, name: raw.ContactName || undefined })
  }

  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.GLAccountCode || undefined,
      description: raw.Description || undefined,
      totalAmount: amount,
    },
  ]

  return {
    id: raw.TransactionID || undefined,
    accountId: raw.GLAccountCode || undefined,
    reference: raw.Reference || undefined,
    memo: raw.Description || undefined,
    currency: raw.Currency || undefined,
    totalAmount: amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
