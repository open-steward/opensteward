import type { Account, AccountStatus } from '../../../schema/account'

export interface Fatture24Conto {
  id: string
  Codice: string
  Descrizione: string
  Attivo: boolean
  Saldo: number
  [key: string]: unknown
}

export function transformAccount(raw: Fatture24Conto): Account {
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
