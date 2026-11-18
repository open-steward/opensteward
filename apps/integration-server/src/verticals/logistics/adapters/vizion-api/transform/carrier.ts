import type { Carrier } from '../../../schema/carrier'

// ─── Vizion raw carrier type ─────────────────────────────────────────────────

export interface VizionCarrier {
  carrier_code?: string | null
  scac?: string | null
  name?: string | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformCarrier(raw: VizionCarrier): Carrier {
  const code = raw.carrier_code ?? raw.scac ?? undefined
  return {
    id: code,
    name: raw.name ?? code ?? undefined,
    code,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
