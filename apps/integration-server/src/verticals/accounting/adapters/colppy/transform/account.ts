import type { Account, AccountStatus } from '../../../schema/account'

export interface ColppyAccount {
  idPlanDeCuenta: number
  nombre: string
  codigo: string
  activa: boolean
  saldo: number
  tipo: string
  rubro: string
  [key: string]: unknown
}

export function transformAccount(raw: ColppyAccount): Account {
  const status: AccountStatus = raw.activa ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.idPlanDeCuenta),
    name: raw.nombre || undefined,
    customerDefinedCode: String(raw.codigo),
    status,
    balance: raw.saldo,
    metadata: raw as Record<string, unknown>,
  }
}
