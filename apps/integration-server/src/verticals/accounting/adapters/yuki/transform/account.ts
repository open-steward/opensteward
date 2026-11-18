/**
 * Yuki GL account transform.
 *
 * Accounts come from AccountingInfo.asmx → GetGLAccountScheme which returns
 * XML containing <GlAccount> elements.
 *
 * Known fields from the WSDL / PHP client:
 *   GLAccountCode   — chart-of-accounts code (e.g. "1000", "4000")
 *   GLAccountType   — account type string (e.g. "Assets", "Liabilities", "Revenue", "Expenses")
 *   Description     — account name / description
 *   IsActive        — boolean-like string ("true"/"false")
 *   Balance         — current balance (string, decimal)
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account'
import { extractFirst, extractBlocks, unescapeXml } from '../client'

// ── Yuki raw type (parsed from SOAP XML) ─────────────────────────────────────

export interface YukiGLAccount {
  GLAccountCode: string
  GLAccountType: string
  Description: string
  IsActive: string
  Balance: string
  [key: string]: unknown
}

// ── XML → YukiGLAccount[] ────────────────────────────────────────────────────

export function parseGLAccountsXml(innerXml: string): YukiGLAccount[] {
  const blocks = extractBlocks(innerXml, 'GlAccount')
  return blocks.map((block) => ({
    GLAccountCode: unescapeXml(extractFirst(block, 'GLAccountCode')),
    GLAccountType: unescapeXml(extractFirst(block, 'GLAccountType')),
    Description: unescapeXml(extractFirst(block, 'Description')),
    IsActive: unescapeXml(extractFirst(block, 'IsActive')),
    Balance: unescapeXml(extractFirst(block, 'Balance')),
  }))
}

// ── Type mappings ─────────────────────────────────────────────────────────────

function mapAccountType(glType: string): AccountType {
  const t = glType.toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit') || t.includes('debt')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income') || t.includes('sales')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: YukiGLAccount): Account {
  const isActive = raw.IsActive?.toLowerCase() !== 'false'
  const status: AccountStatus = isActive ? 'ACTIVE' : 'ARCHIVED'
  const balance = raw.Balance ? parseFloat(raw.Balance) : undefined

  return {
    id: raw.GLAccountCode || undefined,
    name: raw.Description || undefined,
    customerDefinedCode: raw.GLAccountCode || undefined,
    type: raw.GLAccountType ? mapAccountType(raw.GLAccountType) : undefined,
    status,
    balance: isNaN(balance ?? NaN) ? undefined : balance,
    metadata: raw as Record<string, unknown>,
  }
}
