/**
 * Transform a Dext Precision client record into the canonical Organization type.
 *
 * Dext Precision endpoint: GET /clients/{clientId}
 *
 * Response shape (all fields optional / nullable in practice):
 * {
 *   id: string
 *   name: string
 *   providerId: string
 *   practiceCode: string | null
 *   organisationType: string          // e.g. "COMPANY", "SOLE_TRADER"
 *   companyNumber: string | null
 *   healthScore: number
 *   alertLevel: string
 *   hmrcStatus: string
 *   yearEnd: string                   // "YYYY-MM-DD"
 *   vatDetails?: {
 *     scheme: string
 *     number: string                  // "GB 123456789"
 *     reportingCycle: string
 *     periodStart: string
 *     periodEnd: string
 *   }
 *   metrics?: { debtorBalance, avgDebtorDays, oneDayImpact }
 *   bankReconciliation?: { bankAccounts, manualFeeds }
 * }
 */

import type { Organization } from '../../../schema/organization'

export interface DextClientDetail {
  id: string
  name: string
  providerId?: string
  practiceCode?: string | null
  organisationType?: string
  companyNumber?: string | null
  healthScore?: number
  alertLevel?: string
  hmrcStatus?: string
  yearEnd?: string
  vatDetails?: {
    scheme?: string
    number?: string
    reportingCycle?: string
    periodStart?: string
    periodEnd?: string
  }
  metrics?: {
    debtorBalance?: number
    avgDebtorDays?: number
    oneDayImpact?: number
  }
  bankReconciliation?: {
    bankAccounts?: number
    manualFeeds?: number
  }
  [key: string]: unknown
}

export function transformOrganization(raw: DextClientDetail): Organization {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    organizationCode: raw.practiceCode || undefined,
    taxNumber: raw.vatDetails?.number || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
