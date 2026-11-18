/**
 * Ramp tax rate → canonical TaxRate.
 *
 * Ramp endpoint: GET /developer/v1/accounting/tax/rates
 *
 * Ramp tax rates are accounting configuration objects that link a named
 * tax percentage to a GL account within an accounting connection.
 *
 * Key fields:
 *   id                       string — UUID
 *   name                     string — display name (e.g. "Sales Tax 8.75%")
 *   rate                     string — percentage value (e.g. "8.75")
 *   accounting_connection_id string — associated accounting connection
 *   accounting_gl_account_id string — linked GL account
 *   ramp_id                  string — Ramp internal ID
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface RampTaxRate {
  id: string
  name?: string
  rate?: string
  accounting_connection_id?: string
  accounting_gl_account_id?: string
  ramp_id?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: RampTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate != null ? parseFloat(raw.rate) : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
