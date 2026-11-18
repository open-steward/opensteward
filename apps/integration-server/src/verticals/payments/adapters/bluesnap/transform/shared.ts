/**
 * BlueSnap returns money as decimal MAJOR units (e.g. `11.00` USD), unlike
 * gateways that work in minor units. The canonical schema stores integer
 * minor units, so every amount is multiplied by 100 and rounded.
 *
 * BlueSnap does not surface an exponent per currency, so we assume the
 * common two-decimal convention. Zero-decimal currencies (JPY, KRW) are
 * rare on BlueSnap and the over-scaled value is preserved verbatim in
 * `raw` for downstream correction.
 */
export function toMinorUnits(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

/** BlueSnap currencies are ISO 4217; default to USD when absent. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/** Coerce an arbitrary object into a string→string metadata map. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/**
 * BlueSnap returns custom key/value pairs as an array of
 * `{ transactionMetaDataKey, transactionMetaDataValue }` objects. Flatten
 * them into a canonical metadata map.
 */
export interface RawTransactionMetaData {
  metaKey?: string
  metaValue?: string
  metaDescription?: string
  transactionMetaDataKey?: string
  transactionMetaDataValue?: string
}

export function flattenMetaData(
  items: RawTransactionMetaData[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const it of items ?? []) {
    const key = it.transactionMetaDataKey ?? it.metaKey
    const value = it.transactionMetaDataValue ?? it.metaValue
    if (key != null && value != null) out[String(key)] = String(value)
  }
  return out
}
