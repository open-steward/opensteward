import type { Deal } from '../../../schema/deal'

// Qiscus does not have a native deal/opportunity entity
// This is a stub — list returns [] and write methods throw
export interface RawQiscusDeal {
  id: string | number
  title?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawQiscusDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  return out
}
