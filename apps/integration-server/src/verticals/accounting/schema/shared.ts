import { z } from 'zod'
import {
  Amount,
  Description,
  Email as SharedEmail,
  ExternalId,
  Iso3166Alpha2,
  Name,
  Note,
  nullish,
} from '@opensteward/shared'

// Accounting keeps its `address1/address2` field names because the rest of
// the accounting transform pipeline (and downstream consumers) is built
// around them. The shared `AddressSchema` (line1/line2) is used by every
// other vertical via `import { AddressSchema } from '@opensteward/shared'`.
export const AddressSchema = z.object({
  address1: nullish(z.string().max(255)).describe('Street address, line 1.').meta({ example: '2500 Market Street' }),
  address2: nullish(z.string().max(255)).describe('Street address, line 2 (unit, suite).').meta({ example: 'Suite 300' }),
  city: nullish(z.string().max(120)).describe('City or locality.').meta({ example: 'San Francisco' }),
  region: nullish(z.string().max(120)).describe('State, province, or region.').meta({ example: 'CA' }),
  postalCode: nullish(z.string().max(40)).describe('ZIP or postal code.').meta({ example: '94114' }),
  country: nullish(Iso3166Alpha2).meta({ example: 'US' }),
})
export type Address = z.infer<typeof AddressSchema>

export const EmailSchema = z.object({
  email: SharedEmail.describe('RFC 5322 email address.').meta({ example: 'jane.doe@acme.example' }),
  type: z.enum(['WORK', 'HOME', 'OTHER']).optional().meta({ example: 'WORK' }),
})
export type Email = z.infer<typeof EmailSchema>

export const TelephoneSchema = z.object({
  telephone: z.string().max(64).meta({ example: '+14155550123' }),
  type: z.enum(['WORK', 'HOME', 'MOBILE', 'FAX', 'OTHER']).optional().meta({ example: 'WORK' }),
})
export type Telephone = z.infer<typeof TelephoneSchema>

export const AttachmentSchema = z.object({
  id: ExternalId.optional().meta({ example: 'att_5001' }),
  url: nullish(z.url()).describe('Hosted file URL.').meta({ example: 'https://files.acme.example/invoices/INV-1042.pdf' }),
  mimeType: nullish(z.string().max(255)).describe('MIME type, e.g. `application/pdf`.').meta({ example: 'application/pdf' }),
  fileName: nullish(z.string().max(255)).meta({ example: 'INV-1042.pdf' }),
})
export type Attachment = z.infer<typeof AttachmentSchema>

export const ReferenceSchema = z.object({
  id: ExternalId.optional().meta({ example: 'ref_2001' }),
  name: Name.optional().meta({ example: 'Acme Industries' }),
})
export type Reference = z.infer<typeof ReferenceSchema>

export const LineitemSchema = z.object({
  id: ExternalId.optional().meta({ example: 'li_3001' }),
  accountId: nullish(ExternalId)
    .describe('Account.id of the ledger account this line posts to. Always the same identifier space as `Account.id`, so it resolves against the accounts resource directly.')
    .meta({ example: 'acct_4000' }),
  accountCode: nullish(z.string().max(64))
    .describe('Human-facing chart-of-accounts code for `accountId`, when the platform exposes one separately (Xero `AccountCode`). Mirrors `Account.customerDefinedCode`. Display only — platforms do not guarantee it unique or stable, so never join on it.')
    .meta({ example: '4000' }),
  itemId: nullish(ExternalId).meta({ example: 'item_900' }),
  itemName: nullish(Name).meta({ example: 'Annual platform subscription' }),
  itemDescription: nullish(Description).meta({ example: 'Acme Industries annual platform subscription' }),
  itemSku: nullish(z.string().max(256)).meta({ example: 'SUB-ANNUAL' }),
  itemVariants: z.array(ReferenceSchema).optional(),
  locations: z.array(ReferenceSchema).optional(),
  categoryIds: z.array(ExternalId).optional(),
  unitAmount: nullish(Amount).describe('Per-unit price in the parent document currency, minor units.').meta({ example: 115000 }),
  unitQuantity: nullish(z.number().int()).describe('Quantity.').meta({ example: 1 }),
  discountAmount: nullish(Amount).describe('Discount applied to this line, minor units.').meta({ example: 0 }),
  taxAmount: nullish(Amount).describe('Tax component of this line, minor units.').meta({ example: 10000 }),
  taxrateId: nullish(ExternalId).meta({ example: 'tax_ca' }),
  totalAmount: nullish(Amount).describe('Line total (`unitAmount × unitQuantity − discountAmount + taxAmount`), minor units.').meta({ example: 125000 }),
  refundAmount: nullish(Amount).meta({ example: 0 }),
  refundedAt: nullish(z.date()).meta({ example: '2026-02-20T00:00:00Z' }),
  notes: nullish(Note).meta({ example: 'Renewal for the 2026 contract year.' }),
  createdAt: nullish(z.date()).meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: nullish(z.date()).meta({ example: '2026-02-01T14:20:00Z' }),
})
export type Lineitem = z.infer<typeof LineitemSchema>

export const JournalLineitemSchema = z.object({
  id: ExternalId.optional().meta({ example: 'jli_7001' }),
  accountId: nullish(ExternalId).meta({ example: 'acct_4000' }),
  contactId: nullish(ExternalId).meta({ example: 'cus_4Qm2Xa9Lr' }),
  invoiceId: nullish(ExternalId).meta({ example: 'inv_1042' }),
  paymentId: nullish(ExternalId).meta({ example: 'pay_8001' }),
  projectId: nullish(ExternalId).meta({ example: 'proj_500' }),
  organizationId: nullish(ExternalId).meta({ example: 'org_acme' }),
  groupId: nullish(ExternalId).meta({ example: 'grp_100' }),
  categoryIds: z.array(ExternalId).optional(),
  description: nullish(Description).meta({ example: 'Sales revenue — INV-1042' }),
  debitAmount: nullish(Amount).describe('Debit side, minor units.').meta({ example: 125000 }),
  creditAmount: nullish(Amount).describe('Credit side, minor units.').meta({ example: 0 }),
  taxAmount: nullish(Amount).meta({ example: 10000 }),
  totalAmount: nullish(Amount).meta({ example: 125000 }),
})
export type JournalLineitem = z.infer<typeof JournalLineitemSchema>

/**
 * Note the field names differ from `LineitemSchema`: `name`/`description` here,
 * `itemName`/`itemDescription` there. That is a known inconsistency, kept
 * deliberately rather than fixed — aligning them is a breaking change across
 * ~141 adapter mappers and 92 test files, on a field nobody has reported as
 * wrong. Revisit if the canonical schema gets a breaking revision for other
 * reasons; do not "tidy" it in isolation.
 */
export const TransactionLineitemSchema = z.object({
  id: ExternalId.optional().meta({ example: 'tli_6001' }),
  accountId: nullish(ExternalId).meta({ example: 'acct_4000' }),
  // Mirrors `LineitemSchema.accountCode`. The Xero transaction transform has
  // emitted this since the bank-transaction work, but the field was never
  // declared here — and this schema is not strict, so `parse()` stripped it
  // silently on the way out. The transform test asserted it on the pre-parse
  // object and passed throughout.
  accountCode: nullish(z.string().max(64))
    .describe('Human-facing chart-of-accounts code for `accountId`, when the platform exposes one separately (Xero `AccountCode`). Mirrors `Account.customerDefinedCode`. Display only — platforms do not guarantee it unique or stable, so never join on it.')
    .meta({ example: '4000' }),
  name: nullish(Name).meta({ example: 'Annual platform subscription' }),
  description: nullish(Description).meta({ example: 'Acme Industries annual platform subscription' }),
  objectType: nullish(z.string().max(64)).meta({ example: 'sales_item' }),
  unitAmount: nullish(Amount).meta({ example: 115000 }),
  unitQuantity: nullish(z.number().int()).meta({ example: 1 }),
  totalAmount: nullish(Amount).meta({ example: 125000 }),
})
export type TransactionLineitem = z.infer<typeof TransactionLineitemSchema>

// --- Response envelopes ---

export type ListResponse<T> = {
  data: T[]
  meta: {
    platform: string
    /** Total records upstream reports for this collection, or `null` when the
     *  platform does not report one. Never omitted: absence is
     *  indistinguishable from a field that was never implemented, while `null`
     *  is a fact a client can act on. Only 2 of 282 accounting adapters report
     *  a count, so `null` is the common answer, not an edge case. */
    totalCount: number | null
    page: number
    limit: number
    /** `true`/`false` when known, `null` when a full page makes it genuinely
     *  undecidable. See `listPage` for how it is derived without a count. */
    hasMore: boolean | null
    fetchedAt: string
  }
}

export type SingleResponse<T> = {
  data: T
  meta: {
    platform: string
    fetchedAt: string
  }
}

/**
 * `hasMore` is passed in rather than derived here, because the honest
 * derivation needs something this function cannot see: how many rows the
 * ADAPTER returned before the router truncated them. See `listPage`.
 */
export function listResponse<T>(
  data: T[],
  platform: string,
  opts: { totalCount?: number | null; page: number; limit: number; hasMore: boolean | null },
): ListResponse<T> {
  const { totalCount, page, limit, hasMore } = opts
  return {
    data,
    meta: {
      platform,
      totalCount: totalCount ?? null,
      page,
      limit,
      hasMore,
      fetchedAt: new Date().toISOString(),
    },
  }
}

export function singleResponse<T>(data: T, platform: string): SingleResponse<T> {
  return {
    data,
    meta: { platform, fetchedAt: new Date().toISOString() },
  }
}
