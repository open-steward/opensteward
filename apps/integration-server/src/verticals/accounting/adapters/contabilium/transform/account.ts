import type { Account, AccountStatus } from '../../../schema/account'

export interface ContabiliumAccount {
  id: number
  nombre: string
  codigo: string
  activa: boolean
  saldo: number
  tipo: string
  [key: string]: unknown
}

export function transformAccount(raw: ContabiliumAccount): Account {
  const status: AccountStatus = raw.activa ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.nombre || undefined,
    customerDefinedCode: String(raw.codigo),
    status,
    balance: raw.saldo,
    metadata: raw as Record<string, unknown>,
  }
}
