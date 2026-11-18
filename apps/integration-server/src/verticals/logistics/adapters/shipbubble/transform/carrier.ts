import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface ShipbubbleCourier {
  name?: string | null
  service_code?: string | null
  pin_image?: string | null
  origin_country?: string | null
  international?: boolean | null
  domestic?: boolean | null
  express?: boolean | null
  status?: string | null
  package_categories?: Array<{ id?: number | null; category?: string | null }>
  [key: string]: unknown
}

export function transformCarrier(raw: ShipbubbleCourier): Carrier {
  return {
    id: raw.service_code ?? undefined,
    name: raw.name ?? undefined,
    code: raw.service_code ?? undefined,
    isActive: raw.status === 'operational',
    createdAt: toISODate(undefined),
    metadata: raw as Record<string, unknown>,
  }
}
