import type { Carrier } from '../../../schema/carrier'

// ─── Shipmondo raw types ─────────────────────────────────────────────────────

export interface ShipmondoCarrier {
  id?: number | null
  code?: string | null
  name?: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformCarrier(raw: ShipmondoCarrier): Carrier {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    code: raw.code ?? undefined,
    name: raw.name ?? undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
