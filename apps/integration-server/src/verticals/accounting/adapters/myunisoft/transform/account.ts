import type { Account, AccountStatus } from '../../../schema/account'

export interface MyunisoftAccount {
  id: string
  numero: string
  libelle: string
  actif: boolean
  solde: number
  [key: string]: unknown
}

export function transformAccount(raw: MyunisoftAccount): Account {
  const status: AccountStatus = raw.actif ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.libelle || undefined,
    customerDefinedCode: raw.numero || undefined,
    status,
    balance: raw.solde,
    metadata: raw as Record<string, unknown>,
  }
}
