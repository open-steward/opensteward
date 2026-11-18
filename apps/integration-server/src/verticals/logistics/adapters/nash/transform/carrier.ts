import type { Carrier } from '../../../schema/carrier'

export interface NashProvider {
  providerId?: string | null
  name?: string | null
  logo?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: NashProvider): Carrier {
  return {
    id: raw.providerId ?? undefined,
    name: raw.name ?? undefined,
    code: raw.providerId ?? undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
