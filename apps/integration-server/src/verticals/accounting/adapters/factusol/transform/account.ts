/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account, AccountStatus } from '../../../schema/account'

export interface FactusolAccount {
  id: string
  codigo: string
  nombre: string
  activo: boolean
  saldo: number
  tipo: string
  [key: string]: unknown
}

export function transformAccount(raw: FactusolAccount): Account {
  const status: AccountStatus = raw.activo ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.nombre || undefined,
    customerDefinedCode: raw.codigo || undefined,
    status,
    balance: raw.saldo,
    metadata: raw as Record<string, unknown>,
  }
}
