/**
 * Bokio chart-of-accounts `account` → canonical Account.
 *
 * GET /companies/{companyId}/chart-of-accounts
 * (https://docs.bokio.se/reference/get-chart-of-accounts.md) returns a plain
 * array of `account`: { account: int32 "The account number", name,
 * accountType: "customAccount" | "basePlanAccount" }. GET
 * /companies/{companyId}/chart-of-accounts/{account}
 * (https://docs.bokio.se/reference/get-account-with-number.md) returns
 * `accountWithDetails`, the same fields plus `accountBalance` (double,
 * nullable, "The current balance of the account").
 *
 * The key is `account`, a number: it is the id, as a string, and the path
 * parameter of the get-by-id call. `accountType` says whether the account is
 * custom or from the base plan, not what class of account it is, so it is not
 * mapped to the canonical `type`; neither type nor an active flag is
 * documented, so both stay unset.
 */
import type { Account } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

export interface BokioAccount {
  account: number
  name?: string
  accountType?: 'customAccount' | 'basePlanAccount' | string
  /** Only on the get-by-id response (`accountWithDetails`). */
  accountBalance?: number | null
  [key: string]: unknown
}

export function transformAccount(raw: BokioAccount): Account {
  const number = raw.account === undefined || raw.account === null ? undefined : String(raw.account)
  return {
    id: number,
    name: raw.name || undefined,
    customerDefinedCode: number,
    // accountBalance is documented without a currency, so toMinorUnits falls
    // back to two fractional digits.
    balance: toMinorUnits(raw.accountBalance),
    metadata: raw as Record<string, unknown>,
  }
}
