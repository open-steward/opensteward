import type { Account, AccountStatus } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

export interface XubioAccount {
  id: number
  nombre: string
  codigo: string
  activo: boolean
  saldo: number
  tipo: string
  [key: string]: unknown
}

export function transformAccount(raw: XubioAccount): Account {
  const status: AccountStatus = raw.activo ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.nombre || undefined,
    customerDefinedCode: raw.codigo || String(raw.id),
    status,
    balance: toMinorUnits(raw.saldo),
    metadata: raw as Record<string, unknown>,
  }
}
