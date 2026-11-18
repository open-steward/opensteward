/**
 * Spendesk credit-note payable → canonical CreditMemo
 *
 * listCreditMemos reads search payables filtered to `payableType = creditNote`;
 * getCreditMemo reads GET /v1/payables/{id} and accepts only
 * `type === 'creditNote'`.
 *
 * Status is not mapped: the only state either shape carries is bookkeeping
 * (exported to accounting or not), not the credit's lifecycle.
 *
 * Field mapping (search / get):
 *   creditmemoNumber ← documentaryEvidence.creditNoteNumber / creditNoteNumber
 *   contactId        ← counterparty.supplierId|memberId / counterparty.id
 *   totalAmount      ← amount
 *   balanceAmount    ← outstandingAmount
 *   postedAt         ← creationDate / payableDate
 *   createdAt        ← firstCreatedAt / createdAt
 */

import type { CreditMemo } from '../../../schema/creditmemo'
import {
  mapPayableLines,
  mapSearchLines,
  searchContactId,
  toDate,
  type SpendeskPayable,
  type SpendeskSearchPayable,
} from './expense'

/** GET /v1/payables/{id} → CreditMemo */
export function transformPayableAsCreditMemo(raw: SpendeskPayable): CreditMemo {
  return {
    id: raw.id || undefined,
    creditmemoNumber: raw.creditNoteNumber || undefined,
    contactId: raw.counterparty?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
    balanceAmount: typeof raw.outstandingAmount === 'number' ? raw.outstandingAmount : undefined,
    lineItems: mapPayableLines(raw.lineItems),
    postedAt: toDate(raw.payableDate),
    createdAt: toDate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}

/** POST /v1/payables/search (payableType creditNote) → CreditMemo */
export function transformSearchPayableAsCreditMemo(raw: SpendeskSearchPayable): CreditMemo {
  return {
    id: raw.id || undefined,
    // Only the `creditNote` evidence variant documents `creditNoteNumber`.
    creditmemoNumber: raw.documentaryEvidence?.creditNoteNumber || undefined,
    contactId: searchContactId(raw),
    currency: raw.currency || undefined,
    totalAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
    balanceAmount: typeof raw.outstandingAmount === 'number' ? raw.outstandingAmount : undefined,
    lineItems: mapSearchLines(raw.itemLines),
    postedAt: toDate(raw.creationDate),
    createdAt: toDate(raw.firstCreatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
