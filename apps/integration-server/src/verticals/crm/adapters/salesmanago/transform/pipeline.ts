import type { Pipeline } from '../../../schema/pipeline'

export interface RawSaleSmanagoFunnel {
  id?: string
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawSaleSmanagoFunnel): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    is_active: true,
    stages: [],
    metadata: raw,
  }
}
