/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Account, AccountStatus } from '../../../schema/account'

export interface DaneaConto {
  id: string
  Codice: string
  Descrizione: string
  Attivo: boolean
  Saldo: number
  [key: string]: unknown
}

export function transformAccount(raw: DaneaConto): Account {
  const status: AccountStatus = raw.Attivo ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.Descrizione || undefined,
    customerDefinedCode: raw.Codice || undefined,
    status,
    balance: raw.Saldo,
    metadata: raw as Record<string, unknown>,
  }
}
