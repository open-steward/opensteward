import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Moss Supplier address ─────────────────────────────────────────────────────

export interface MossSupplierAddress {
  street?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
  [key: string]: unknown
}

// ── Moss Supplier ─────────────────────────────────────────────────────────────

export interface MossSupplier {
  id: string
  organisationId: string
  name: string
  code?: string | null
  currency?: string | null
  vatIdNo?: string | null
  iban?: string | null
  bic?: string | null
  accountNumber?: string | null
  sortCode?: string | null
  status: string
  address?: MossSupplierAddress | null
  defaultExpenseAccountId?: string | null
  defaultVatRateId?: string | null
  paymentTermId?: string | null
  createTime: string
  updateTime: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformSupplier(raw: MossSupplier): Contact {
  const emails = toWorkEmail(undefined)  // Moss supplier has no email field in the schema

  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.code || undefined,
    taxNumber: raw.vatIdNo || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.status === 'ACTIVE',
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.address?.street || undefined,
      city: raw.address?.city || undefined,
      postalCode: raw.address?.postalCode || undefined,
      country: raw.address?.country || undefined,
    }),
    createdAt: raw.createTime ? new Date(raw.createTime) : undefined,
    updatedAt: raw.updateTime ? new Date(raw.updateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
