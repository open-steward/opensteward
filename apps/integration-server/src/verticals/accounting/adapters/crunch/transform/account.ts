import type { Account } from '../../../schema/account'

// ── Crunch wire types ─────────────────────────────────────────────────────────

/** BankAccountDto from GET /banking/bank-accounts */
export interface CrunchBankAccount {
  id?: number
  bankName?: string
  displayName?: string
  sortCode?: string
  accountNumber?: string
  iban?: string
  bic?: string
  archived?: boolean
  default?: boolean
  personal?: boolean
  balanceDto?: { date?: string; balance?: number }
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBankAccount(raw: CrunchBankAccount): Account {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.displayName ?? raw.bankName ?? undefined,
    type: 'ASSET',
    status: raw.archived ? 'ARCHIVED' : 'ACTIVE',
    balance:
      raw.balanceDto?.balance !== undefined
        ? Math.round(raw.balanceDto.balance * 100)
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
