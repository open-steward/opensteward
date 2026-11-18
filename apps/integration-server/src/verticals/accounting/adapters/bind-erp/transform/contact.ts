/**
 * Bind ERP → canonical Contact transform.
 *
 * Bind ERP has two separate resources:
 *   - Clients   → GET /api/Clients         (customers, isCustomer=true)
 *   - Providers → GET /api/Providers       (suppliers, isSupplier=true)
 *
 * Both map to the unified Contact schema.
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Raw Bind ERP types ──────────────────────────────────────────────────────

export interface BindClientListItem {
  ID?: string
  Number?: number
  ClientName?: string
  LegalName?: string
  RFC?: string
  Email?: string
  Phone?: string
  City?: string
  NextContactDate?: string
  [key: string]: unknown
}

export interface BindClientDetails {
  ID?: string
  RFC?: string
  LegalName?: string
  CommercialName?: string
  CreditDays?: number
  CreditAmount?: number
  PaymentMethod?: string
  CreationDate?: string
  Status?: string
  Email?: string
  Telephones?: string
  Number?: number
  AccountNumber?: string
  DefaultDiscount?: number
  Addresses?: string[]
  [key: string]: unknown
}

export interface BindProviderListItem {
  ID?: string
  Number?: number
  ProviderName?: string
  LegalName?: string
  RFC?: string
  Email?: string
  Phone?: string
  City?: string
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformClientListItem(raw: BindClientListItem): Contact {
  const emails = toWorkEmail(raw.Email)
  const phones: Telephone[] = []
  if (raw.Phone) phones.push({ telephone: raw.Phone, type: 'WORK' })

  return {
    id: raw.ID || String(raw.Number ?? ''),
    name: raw.ClientName || raw.LegalName || undefined,
    companyName: raw.LegalName || undefined,
    identification: raw.RFC || undefined,
    taxNumber: raw.RFC || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(phones),
    billingAddress: toAddress({ city: raw.City }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformClientDetails(raw: BindClientDetails): Contact {
  const emails = toWorkEmail(raw.Email)
  const phones: Telephone[] = []
  if (raw.Telephones) phones.push({ telephone: raw.Telephones, type: 'WORK' })

  return {
    id: raw.ID || String(raw.Number ?? ''),
    name: raw.CommercialName || raw.LegalName || undefined,
    companyName: raw.LegalName || undefined,
    identification: raw.RFC || undefined,
    taxNumber: raw.RFC || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.Status ? raw.Status !== 'Inactive' && raw.Status !== 'inactive' : true,
    emails: nonempty(emails),
    telephones: nonempty(phones),
    createdAt: raw.CreationDate ? new Date(raw.CreationDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformProviderListItem(raw: BindProviderListItem): Contact {
  const emails = toWorkEmail(raw.Email)
  const phones: Telephone[] = []
  if (raw.Phone) phones.push({ telephone: raw.Phone, type: 'WORK' })

  return {
    id: raw.ID || String(raw.Number ?? ''),
    name: raw.ProviderName || raw.LegalName || undefined,
    companyName: raw.LegalName || undefined,
    identification: raw.RFC || undefined,
    taxNumber: raw.RFC || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(phones),
    billingAddress: toAddress({ city: raw.City }),
    metadata: raw as Record<string, unknown>,
  }
}
