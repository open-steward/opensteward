import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish, withUnknown } from '@opensteward/shared'

export const AccountStatusSchema = z.enum(['ACTIVE', 'ARCHIVED'])
export type AccountStatus = z.infer<typeof AccountStatusSchema>

export const AccountTypeSchema = withUnknown([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE',
  'OTHER',
])
export type AccountType = z.infer<typeof AccountTypeSchema>

export const AccountTaxonomySchema = z.object({
  id: z.string().optional().meta({ example: 'tax_node_income' }),
  name: z.string().optional().meta({ example: 'Income' }),
  type: z.string().optional().meta({ example: 'INCOME' }),
})
export type AccountTaxonomy = z.infer<typeof AccountTaxonomySchema>

export const AccountSchema = z.object({
  id: ExternalId.optional().meta({ example: 'acct_4000' }),
  name: z.string().optional().meta({ example: '4000 — Sales' }),
  description: z.string().optional().meta({ example: 'Revenue from product and subscription sales' }),
  customerDefinedCode: z.string().optional().meta({ example: '4000' }),
  type: AccountTypeSchema.optional().meta({ example: 'INCOME' }),
  status: AccountStatusSchema.optional().meta({ example: 'ACTIVE' }),
  group: z.string().optional().meta({ example: 'Revenue' }),
  section: z.string().optional().meta({ example: 'Operating Income' }),
  subgroup: z.string().optional().meta({ example: 'Product Sales' }),
  subsection: z.string().optional().meta({ example: 'Subscriptions' }),
  parentId: z.string().optional().meta({ example: 'acct_4000_parent' }),
  isPayable: z.boolean().optional().meta({ example: false }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  balance: nullish(Amount).describe('Signed account balance, minor units. Negative for accounts owing.').meta({ example: 125000 }),
  taxonomy: z.array(AccountTaxonomySchema).optional(),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Account = z.infer<typeof AccountSchema>
