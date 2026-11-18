import type { Account, AccountStatus } from '../../../schema/account'

export interface ArubaContoConto {
  id: string
  codice: string
  descrizione: string
  attivo: boolean
  saldo: number
  [key: string]: unknown
}

export function transformAccount(raw: ArubaContoConto): Account {
  const status: AccountStatus = raw.attivo ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.descrizione || undefined,
    customerDefinedCode: raw.codice || undefined,
    status,
    balance: raw.saldo,
    metadata: raw as Record<string, unknown>,
  }
}
