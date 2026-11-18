/**
 * Transform Pleo company balance / company info to canonical Organization.
 *
 * Pleo API: GET /companies/balance
 * Response fields: currency, current, available
 *
 * Pleo REST API v1 does not expose a rich organization/company profile endpoint.
 * The only company-scoped endpoint is GET /companies/balance which returns wallet data.
 * We map what is available and return a minimal Organization.
 *
 * Docs: https://developers.pleo.io/
 */

import type { Organization } from '../../../schema/organization'

export interface PleoCompanyBalance {
  currency?: string
  current?: number
  available?: number
  [key: string]: unknown
}

export function transformOrganization(raw: PleoCompanyBalance): Organization {
  return {
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
