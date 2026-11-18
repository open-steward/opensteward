/**
 * Ramp GL account → canonical Account.
 *
 * Ramp endpoint: GET /developer/v1/accounting/accounts
 *
 * Ramp GL accounts are chart-of-accounts entries synced from an ERP
 * (or managed directly via the Ramp API).
 *
 * Key fields:
 *   id                       string (UUID)
 *   remote_id                string — external ERP ID
 *   code                     string — account code (e.g. "4000")
 *   name                     string
 *   is_active                boolean
 *   is_synced                boolean
 *   accounting_connection_id string
 */

import type { Account } from '../../../schema/account'

export interface RampGLAccount {
  id: string
  remote_id?: string
  code?: string
  name?: string
  is_active?: boolean
  is_synced?: boolean
  accounting_connection_id?: string
  [key: string]: unknown
}

export function transformAccount(raw: RampGLAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    status: raw.is_active === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
