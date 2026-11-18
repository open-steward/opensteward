import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface TerminalAfricaCarrier {
  carrier_id?: string | null
  slug?: string | null
  name?: string | null
  logo?: string | null
  active?: boolean | null
  domestic?: boolean | null
  international?: boolean | null
  regional?: boolean | null
  available_countries?: string[]
  contact?: { email?: string | null; phone?: string | null } | null
  requires_invoice?: boolean | null
  requires_waybill?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: TerminalAfricaCarrier): Carrier {
  return {
    id: raw.carrier_id ?? raw.slug ?? undefined,
    name: raw.name ?? undefined,
    code: raw.slug ?? undefined,
    isActive: raw.active ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
