import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface OdooAccount {
  id?: number
  code?: string
  name?: string
  /** 16.0+: `account_type = fields.Selection(`… */
  account_type?: string
  /** 14.0: `internal_group = fields.Selection([('equity', …), ('asset', …), ('liability', …), ('income', …), ('expense', …), ('off_balance', …)]` */
  internal_group?: string | false
  /** Up to 18.0: `deprecated = fields.Boolean(…)` */
  deprecated?: boolean
  /** 19.0: `active = fields.Boolean(default=True, tracking=True)` */
  active?: boolean
  [key: string]: unknown
}

function mapType(accountType: string | undefined): AccountType {
  const t = (accountType ?? '').toLowerCase()
  if (t.startsWith('asset')) return 'ASSET'
  if (t.startsWith('liability')) return 'LIABILITY'
  if (t.startsWith('equity')) return 'EQUITY'
  if (t.startsWith('income') || t.startsWith('other_income')) return 'INCOME'
  if (t.startsWith('expense') || t.startsWith('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: OdooAccount): Account {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    customerDefinedCode: raw.code || undefined,
    name: raw.name || undefined,
    type: mapType(raw.account_type || raw.internal_group || undefined),
    status: (raw.deprecated === true || raw.active === false
      ? 'ARCHIVED'
      : 'ACTIVE') as AccountStatus,
    metadata: raw as Record<string, unknown>,
  }
}
