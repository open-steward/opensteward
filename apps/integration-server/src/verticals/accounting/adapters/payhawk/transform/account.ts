import type { Account, AccountStatus } from '../../../schema/account'

/**
 * IFundAccount, the fund account the first-party spec documents for
 * GET /api/v3/accounts/{accountId}/fund-accounts and fund-accounts/{id}
 * (https://api.payhawk.com/api/v3/docs.json). It has these five properties and
 * `additionalProperties: false`: no name, IBAN or BIC, so an account has no
 * label to map and its id is its code.
 */
export interface PayhawkFundAccount {
  id: string
  currency?: string
  type?: 'debit' | 'credit' | 'linked' | 'linked_card'
  status?: 'processing' | 'active' | 'blocked' | 'closed' | 'pending_closure'
  /**
   * IFundAccountBalance: "Present only for the debit and credit balance
   * types." An object, not a number.
   */
  balance?: { availableAmount?: number; reservedAmount?: number }
}

/** Convert a Payhawk decimal float amount to integer minor units (cents). */
function toMinorUnits(value: number | undefined | null): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

export function transformAccount(raw: PayhawkFundAccount): Account {
  // The canonical status is ACTIVE or ARCHIVED. Only a closed account is
  // gone; processing, blocked and pending_closure accounts still exist, and
  // the exact status stays in metadata.
  const status: AccountStatus = raw.status === 'closed' ? 'ARCHIVED' : 'ACTIVE'

  return {
    id: raw.id,
    customerDefinedCode: raw.id,
    status,
    balance: toMinorUnits(raw.balance?.availableAmount),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
