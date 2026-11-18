import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface TiveCarrierRaw {
  id?: string | null
  name?: string | null
  mode?: string | null
  standardizedCarrierId?: string | null
  standardizedName?: string | null
  accountId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export interface TiveCarriersResponse {
  data: TiveCarrierRaw[]
  totalRecords?: number | null
  pageNumber?: number | null
  pageSize?: number | null
}

export function transformCarrier(raw: TiveCarrierRaw): Carrier {
  return {
    id: raw.id ?? raw.standardizedCarrierId ?? undefined,
    name: raw.name ?? raw.standardizedName ?? undefined,
    code: raw.standardizedCarrierId ?? undefined,
    isActive: true,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
