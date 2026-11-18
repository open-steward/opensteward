/**
 * Spendesk account → canonical Account
 *
 * Source: GET /v1/experimental/accounts ("Returns accounts from accounting
 * integrations.") and GET /v1/experimental/accounts/{accountId}
 * (https://developer.spendesk.com/reference/v1-get-accounts).
 *
 * Field mapping:
 *   id                  ← id
 *   name                ← name
 *   description         ← description (nullable)
 *   customerDefinedCode ← code (nullable)
 *   type                ← type: bank → ASSET, expense → EXPENSE,
 *                         supplier / employee → LIABILITY (amounts owed to
 *                         suppliers and employees); tax and reverseCharge can
 *                         sit on either side of the balance sheet → 'unknown'
 *   isPayable           ← type is supplier or employee
 *   status              ← isArchived ? ARCHIVED : ACTIVE
 *   currency            ← currency, when an ISO 4217 code (the field is a
 *                         free nullable string)
 *   createdAt           ← createdAt
 */

import type { Account } from '../../../schema/account'
import { toIsoDatetime } from '@opensteward/shared'

export type SpendeskAccountType =
  'bank' | 'expense' | 'tax' | 'supplier' | 'employee' | 'reverseCharge'

export interface SpendeskAccount {
  id: string
  name: string
  description: string | null
  type: SpendeskAccountType
  code: string | null
  creditCode: string | null
  auxiliaryCode: string | null
  externalId: string | null
  purpose: 'company' | 'spendesk' | 'bankFees' | null
  taxRate: number | null
  currency: string | null
  isAvailable: boolean
  isArchived: boolean
  companyId: string
  createdAt?: string
  defaultFor?: string | null
}

/** The list response of GET /v1/experimental/accounts. */
export interface SpendeskAccountList {
  data: SpendeskAccount[]
  totalResults: number
  currentOffset: number
  currentFetch: number
}

const TYPE: Record<SpendeskAccountType, NonNullable<Account['type']>> = {
  bank: 'ASSET',
  expense: 'EXPENSE',
  supplier: 'LIABILITY',
  employee: 'LIABILITY',
  tax: 'unknown',
  reverseCharge: 'unknown',
}

export function transformAccount(raw: SpendeskAccount): Account {
  const created = toIsoDatetime(raw.createdAt)
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: TYPE[raw.type] ?? 'unknown',
    isPayable: raw.type === 'supplier' || raw.type === 'employee',
    status: raw.isArchived ? 'ARCHIVED' : 'ACTIVE',
    currency: raw.currency && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : undefined,
    createdAt: created ? new Date(created) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
