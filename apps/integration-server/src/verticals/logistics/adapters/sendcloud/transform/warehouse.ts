import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

// ─── Sendcloud raw types ─────────────────────────────────────────────────────

export interface SendcloudSenderAddress {
  id: number | string
  company_name?: string | null
  contact_name?: string | null
  email?: string | null
  telephone?: string | null
  street?: string | null
  house_number?: string | number | null
  postal_box?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string | null
  vat_number?: string | null
  coc_number?: string | null
  eori_number?: string | null
  brand_id?: number | string | null
  [key: string]: unknown
}

export interface SendcloudSenderAddressesResponse {
  sender_addresses?: SendcloudSenderAddress[] | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

function toSenderAddress(raw: SendcloudSenderAddress): Address | undefined {
  const street1 = raw.street
    ? `${raw.street}${raw.house_number != null ? ` ${raw.house_number}` : ''}`
    : undefined

  const addr: Address = {
    name: raw.contact_name ?? undefined,
    company: raw.company_name ?? undefined,
    street1: street1 ?? undefined,
    street2: raw.postal_box ?? undefined,
    city: raw.city ?? undefined,
    postalCode: raw.postal_code ?? undefined,
    country: (raw.country ?? undefined) as Address['country'],
    phone: raw.telephone ?? undefined,
    email: raw.email ?? undefined,
  }

  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

export function transformWarehouse(raw: SendcloudSenderAddress): Warehouse {
  return {
    id: String(raw.id),
    name: raw.company_name ?? raw.contact_name ?? undefined,
    code: String(raw.id),
    address: toSenderAddress(raw),
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
