/**
 * Digits `Category` → canonical Account.
 *
 * GET /v1/ledger/categories returns `ListCategoriesResponse` = `{ categories: Category[] }`
 * and GET /v1/ledger/category/{id} returns one `Category`
 * (https://developer.digits.com/openapi/openapi.yaml). `Category` properties:
 * id, name, parentId, displayNumber, active, type, createdAt, updatedAt, subtype.
 *
 * Chart-of-accounts guide (https://developer.digits.com/docs/chart-of-accounts.md):
 *   "**displayNumber**: Account number used for traditional chart of accounts numbering"
 *   "**active**: Whether the category is currently active and available for use"
 *   "**parentId**: ID of the parent category if this is a subcategory"
 */
import type { Account, AccountType } from '../../../schema/account'

/** `Category.type` enum from the spec. */
export type DigitsCategoryType =
  | 'UnknownType'
  | 'Assets'
  | 'Liabilities'
  | 'Equity'
  | 'Income'
  | 'Expenses'
  | 'CostOfGoodsSold'
  | 'OtherIncome'
  | 'OtherExpenses'

export interface DigitsCategory {
  id?: string
  name?: string
  parentId?: string
  displayNumber?: string
  active?: boolean
  type?: DigitsCategoryType | string
  subtype?: string
  createdAt?: string
  updatedAt?: string
}

const TYPE_MAP: Record<string, AccountType> = {
  Assets: 'ASSET',
  Liabilities: 'LIABILITY',
  Equity: 'EQUITY',
  Income: 'INCOME',
  OtherIncome: 'INCOME',
  Expenses: 'EXPENSE',
  CostOfGoodsSold: 'EXPENSE',
  OtherExpenses: 'EXPENSE',
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function transformCategory(raw: DigitsCategory): Account {
  if (!raw.id) throw new Error('Digits category has no id')
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.displayNumber || undefined,
    // 'UnknownType' and any value the spec does not list stay visible as 'unknown'.
    type: raw.type === undefined ? undefined : (TYPE_MAP[raw.type] ?? 'unknown'),
    status: raw.active === true ? 'ACTIVE' : raw.active === false ? 'ARCHIVED' : undefined,
    subgroup: raw.subtype || undefined,
    parentId: raw.parentId || undefined,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    metadata: { ...raw },
  }
}
