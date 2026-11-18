import type { Account, AccountStatus } from '../../../schema/account'

export interface AnfixAccount {
  id: string
  codigo: string
  nombre: string
  activo: boolean
  saldo: number
  tipo: string
  [key: string]: unknown
}

export function transformAccount(raw: AnfixAccount): Account {
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
