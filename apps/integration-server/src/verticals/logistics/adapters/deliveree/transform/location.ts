import type { Address } from '../../../schema/shared'

export interface DelivereeLocation {
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  recipient_name?: string | null
  recipient_phone?: string | null
  note?: string | null
  need_cod?: boolean | null
  cod_invoice_fees?: number | null
  need_pod?: boolean | null
  [key: string]: unknown
}

export function transformLocation(raw: DelivereeLocation | null | undefined): Address | undefined {
  if (!raw) return undefined
  const hasAny = raw.address || raw.recipient_name || raw.recipient_phone
  if (!hasAny) return undefined
  return {
    name: raw.recipient_name ?? undefined,
    street1: raw.address ?? undefined,
    phone: raw.recipient_phone ?? undefined,
  }
}
