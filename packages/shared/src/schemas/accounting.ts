/**
 * Shared Zod schemas for the accounting vertical.
 */
import { z } from 'zod'

export const AddressSchema = z.object({
  address1: z.string().optional().meta({ example: '2500 Market Street' }),
  address2: z.string().optional().meta({ example: 'Suite 300' }),
  city: z.string().optional().meta({ example: 'San Francisco' }),
  region: z.string().optional().meta({ example: 'CA' }),
  postalCode: z.string().optional().meta({ example: '94114' }),
  country: z.string().optional().meta({ example: 'US' }),
})
export type Address = z.infer<typeof AddressSchema>

export const EmailSchema = z.object({
  email: z.string().meta({ example: 'jane.doe@acme.example' }),
  type: z.enum(['WORK', 'HOME', 'OTHER']).optional().meta({ example: 'WORK' }),
})
export type Email = z.infer<typeof EmailSchema>

export const TelephoneSchema = z.object({
  telephone: z.string().meta({ example: '+14155550123' }),
  type: z.enum(['WORK', 'HOME', 'MOBILE', 'FAX', 'OTHER']).optional().meta({ example: 'WORK' }),
})
export type Telephone = z.infer<typeof TelephoneSchema>

export const AttachmentSchema = z.object({
  id: z.string().optional().meta({ example: 'att_8Hn2Kq' }),
  url: z.string().optional().meta({ example: 'https://files.acme.example/invoice-2026-01.pdf' }),
  mimeType: z.string().optional().meta({ example: 'application/pdf' }),
  fileName: z.string().optional().meta({ example: 'invoice-2026-01.pdf' }),
})
export type Attachment = z.infer<typeof AttachmentSchema>

export const ReferenceSchema = z.object({
  id: z.string().optional().meta({ example: 'acct_4000' }),
  name: z.string().optional().meta({ example: 'Accounts Receivable' }),
})
export type Reference = z.infer<typeof ReferenceSchema>

export const LineitemSchema = z.object({
  id: z.string().optional().meta({ example: 'li_5Tn8Pq' }),
  accountId: z.string().optional().meta({ example: 'acct_4000' }),
  itemId: z.string().optional().meta({ example: 'item_7Wq2' }),
  itemName: z.string().optional().meta({ example: 'Wireless Keyboard' }),
  itemDescription: z.string().optional().meta({ example: 'Compact wireless keyboard' }),
  itemSku: z.string().optional().meta({ example: 'KB-WL-001' }),
  itemVariants: z.array(ReferenceSchema).optional(),
  locations: z.array(ReferenceSchema).optional(),
  categoryIds: z
    .array(z.string())
    .optional()
    .meta({ example: ['cat_office'] }),
  unitAmount: z.number().optional().meta({ example: 49.99 }),
  unitQuantity: z.number().optional().meta({ example: 25 }),
  discountAmount: z.number().optional().meta({ example: 0 }),
  taxAmount: z.number().optional().meta({ example: 106.23 }),
  taxrateId: z.string().optional().meta({ example: 'tax_ca_725' }),
  totalAmount: z.number().optional().meta({ example: 1250.0 }),
  refundAmount: z.number().optional().meta({ example: 0 }),
  refundedAt: z
    .date()
    .optional()
    .meta({ example: new Date('2026-02-01T14:20:00Z') }),
  notes: z.string().optional().meta({ example: 'Bulk order for Acme Industries.' }),
  createdAt: z
    .date()
    .optional()
    .meta({ example: new Date('2026-01-15T09:30:00Z') }),
  updatedAt: z
    .date()
    .optional()
    .meta({ example: new Date('2026-02-01T14:20:00Z') }),
})
export type Lineitem = z.infer<typeof LineitemSchema>

export const JournalLineitemSchema = z.object({
  id: z.string().optional().meta({ example: 'jl_2Bd9Xz' }),
  accountId: z.string().optional().meta({ example: 'acct_4000' }),
  contactId: z.string().optional().meta({ example: 'cont_acme' }),
  invoiceId: z.string().optional().meta({ example: 'inv_9Kp3' }),
  paymentId: z.string().optional().meta({ example: 'pay_7Lm2' }),
  projectId: z.string().optional().meta({ example: 'proj_north' }),
  organizationId: z.string().optional().meta({ example: 'org_acme' }),
  groupId: z.string().optional().meta({ example: 'grp_sales' }),
  categoryIds: z
    .array(z.string())
    .optional()
    .meta({ example: ['cat_revenue'] }),
  description: z.string().optional().meta({ example: 'Invoice payment from Acme Industries' }),
  debitAmount: z.number().optional().meta({ example: 1250.0 }),
  creditAmount: z.number().optional().meta({ example: 0 }),
  taxAmount: z.number().optional().meta({ example: 106.23 }),
  totalAmount: z.number().optional().meta({ example: 1250.0 }),
})
export type JournalLineitem = z.infer<typeof JournalLineitemSchema>

export const TransactionLineitemSchema = z.object({
  id: z.string().optional().meta({ example: 'tl_6Yc4Rn' }),
  accountId: z.string().optional().meta({ example: 'acct_4000' }),
  name: z.string().optional().meta({ example: 'Wireless Keyboard' }),
  description: z.string().optional().meta({ example: 'Compact wireless keyboard' }),
  objectType: z.string().optional().meta({ example: 'invoice' }),
  unitAmount: z.number().optional().meta({ example: 49.99 }),
  unitQuantity: z.number().optional().meta({ example: 25 }),
  totalAmount: z.number().optional().meta({ example: 1250.0 }),
})
export type TransactionLineitem = z.infer<typeof TransactionLineitemSchema>

// ── Response envelopes ────────────────────────────────────────────────────────

export type ListResponse<T> = {
  data: T[]
  meta: {
    platform: string
    totalCount?: number
    page?: number
    limit?: number
    hasMore?: boolean
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

export function listResponse<T>(
  data: T[],
  platform: string,
  opts?: { totalCount?: number; page?: number; limit?: number },
): ListResponse<T> {
  const { totalCount, page, limit } = opts ?? {}
  return {
    data,
    meta: {
      platform,
      totalCount,
      page,
      limit,
      hasMore:
        totalCount !== undefined && page !== undefined && limit !== undefined
          ? page * limit < totalCount
          : undefined,
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
