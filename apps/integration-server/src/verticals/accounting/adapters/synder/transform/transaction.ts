/**
 * Transform Synder import-job records to the canonical Transaction type.
 *
 * Synder's closest analogue to a transaction is an import job (POST /imports).
 * Each import job represents a batch of records pushed into QuickBooks/Xero.
 * We surface import jobs as Transaction records so callers can track which
 * batches have been processed and their outcomes.
 *
 * API endpoint:
 *   GET /companies/{companyId}/imports
 *   GET /companies/{companyId}/imports/{importId}
 */

import type { Transaction } from '../../../schema/transaction'

// ── Synder import-job shape ───────────────────────────────────────────────────

export interface SynderImportSummary {
  total: number
  succeeded: number
  failed: number
  warnings: number
}

export interface SynderImportCompany {
  id: string
  name: string
}

export interface SynderImport {
  id: string
  status: string   // SCHEDULED|IN_PROGRESS|FINISHED|FINISHED_WITH_WARNINGS|FAILED|CANCELED|REVERTING|REVERTED
  entityName: string
  mappingId: string
  dateCreated: string     // ISO 8601
  dateFinished: string | null
  summary: SynderImportSummary
  company: SynderImportCompany
  [key: string]: unknown
}

// ── Map status to a human-readable type label ─────────────────────────────────

function mapType(status: string): string {
  switch (status) {
    case 'FINISHED': return 'IMPORT_FINISHED'
    case 'FINISHED_WITH_WARNINGS': return 'IMPORT_FINISHED_WITH_WARNINGS'
    case 'FAILED': return 'IMPORT_FAILED'
    case 'CANCELED': return 'IMPORT_CANCELED'
    case 'IN_PROGRESS': return 'IMPORT_IN_PROGRESS'
    case 'SCHEDULED': return 'IMPORT_SCHEDULED'
    case 'REVERTING': return 'IMPORT_REVERTING'
    case 'REVERTED': return 'IMPORT_REVERTED'
    default: return status || 'IMPORT'
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformImport(raw: SynderImport): Transaction {
  return {
    id: raw.id || undefined,
    type: mapType(raw.status),
    memo: raw.entityName || undefined,
    reference: raw.mappingId || undefined,
    // totalAmount is intentionally omitted: SynderImportSummary.total is a
    // record COUNT (number of import job records), not a monetary amount.
    // The canonical Amount field requires integer minor units (cents).
    createdAt: raw.dateCreated ? new Date(raw.dateCreated) : undefined,
    updatedAt: raw.dateFinished ? new Date(raw.dateFinished) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
