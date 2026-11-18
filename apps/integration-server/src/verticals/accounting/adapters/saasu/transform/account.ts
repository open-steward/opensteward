/**
 * Saasu AccountDetail → canonical Account.
 *
 * GET Accounts returns `AccountListResponse { Accounts[], _links[] }` of
 * `AccountDetail`; GET Account/{Id} returns the `AccountDetail` itself
 * (https://api.saasu.com/Help/Api/GET-Accounts,
 * https://api.saasu.com/Help/Api/GET-Account-Id-optionalargs, fetched
 * 2026-09-29):
 *
 *   Id → id, Name → name
 *   LedgerCode ("A unique code to identify the account in general ledger")
 *     → customerDefinedCode
 *   AccountType → type; the documented values are
 *     Income|Expense|Asset|Equity|Liability|OtherIncome|OtherExpense|CostOfSales
 *     (the `AccountType` filter, https://api.saasu.com/Help)
 *   IsActive → status, HeaderAccountId ("The Header account for this detail
 *     account") → parentId, Currency → currency
 *   CreatedDateUtc / LastModifiedDateUtc → createdAt / updatedAt
 */
import type { Account, AccountStatus, AccountType } from '../../../schema/account'
import { toUtcDate } from '../../shared/transform'

export interface SaasuAccount {
  Id: number
  Name?: string | null
  AccountLevel?: string | null
  AccountType?: string | null
  IsActive?: boolean | null
  LedgerCode?: string | null
  Currency?: string | null
  HeaderAccountId?: number | null
  IsBankAccount?: boolean | null
  CreatedDateUtc?: string | null
  LastModifiedDateUtc?: string | null
  [key: string]: unknown
}

function mapAccountType(type: string | null | undefined): AccountType | undefined {
  switch (type) {
    case undefined:
    case null:
      return undefined
    case 'Asset':
      return 'ASSET'
    case 'Liability':
      return 'LIABILITY'
    case 'Equity':
      return 'EQUITY'
    case 'Income':
    case 'OtherIncome':
      return 'INCOME'
    case 'Expense':
    case 'OtherExpense':
    case 'CostOfSales':
      return 'EXPENSE'
    default:
      return 'unknown'
  }
}

export function transformAccount(raw: SaasuAccount): Account {
  const status: AccountStatus | undefined =
    typeof raw.IsActive === 'boolean' ? (raw.IsActive ? 'ACTIVE' : 'ARCHIVED') : undefined
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    customerDefinedCode: raw.LedgerCode || undefined,
    status,
    type: mapAccountType(raw.AccountType),
    parentId: raw.HeaderAccountId != null ? String(raw.HeaderAccountId) : undefined,
    currency: raw.Currency || undefined,
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}
