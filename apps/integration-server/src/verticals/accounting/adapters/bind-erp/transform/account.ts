/**
 * Bind ERP → canonical Account transform.
 *
 * Source: GET /api/Accounts
 *
 * Bind ERP account fields (from SDK v1.2):
 *   ID, Number, Description, GLGroup, Group, SubGroup,
 *   GLGroupID, GroupID, SubGroupID
 *
 * There is no active/archived flag in the API response; all returned
 * accounts are treated as ACTIVE.
 */

import type { Account, AccountType } from '../../../schema/account'

// ── Raw Bind ERP type ────────────────────────────────────────────────────────

export interface BindAccount {
  ID?: string
  Number?: string
  Description?: string
  GLGroup?: string
  Group?: string
  SubGroup?: string
  GLGroupID?: string
  GroupID?: string
  SubGroupID?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Attempt to infer account type from the GLGroup name (Spanish ERP terminology).
 * Falls back to 'OTHER' when the group cannot be mapped.
 */
function inferAccountType(glGroup?: string): AccountType {
  if (!glGroup) return 'OTHER'
  const g = glGroup.toUpperCase()
  if (g.includes('ACTIVO') || g.includes('ASSET')) return 'ASSET'
  if (g.includes('PASIVO') || g.includes('LIABILIT')) return 'LIABILITY'
  if (g.includes('CAPITAL') || g.includes('EQUITY') || g.includes('PATRIMONIO')) return 'EQUITY'
  if (g.includes('INGRESO') || g.includes('VENTA') || g.includes('INCOME') || g.includes('REVENUE')) return 'INCOME'
  if (g.includes('GASTO') || g.includes('COSTO') || g.includes('EXPENSE')) return 'EXPENSE'
  return 'OTHER'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformAccount(raw: BindAccount): Account {
  return {
    id: raw.ID || raw.Number || '',
    name: raw.Description || undefined,
    customerDefinedCode: raw.Number || undefined,
    type: inferAccountType(raw.GLGroup),
    status: 'ACTIVE',
    group: raw.GLGroup || undefined,
    section: raw.Group || undefined,
    subgroup: raw.SubGroup || undefined,
    parentId: raw.GLGroupID || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
