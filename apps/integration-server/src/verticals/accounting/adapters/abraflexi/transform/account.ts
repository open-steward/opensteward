import type { Account } from '../../../schema/account'

export interface AbraflexiAccount {
  id: string | number
  kod?: string
  nazev?: string
  typUctu?: string
  mena?: string
  zůstatek?: number
  [key: string]: unknown
}

export function transformAccount(raw: AbraflexiAccount): Account {
  return {
    id: String(raw.id),
    name: raw.nazev || undefined,
    customerDefinedCode: raw.kod || undefined,
    currency: raw.mena || undefined,
    balance: raw.zůstatek,
    metadata: raw as Record<string, unknown>,
  }
}
