/**
 * Movidesk (Zenvia Service) service → Tag transform.
 *
 * Movidesk does not have a first-class "tag" concept. The closest equivalent
 * is the hierarchical services/categories catalog available via
 * GET /public/v1/services. Each service has a name, optional parentServiceId,
 * and an array of category strings.
 *
 * We surface each service as a canonical Tag so callers can enumerate the
 * service catalog through the standard tags interface.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMovideskService {
  id?: number | null
  name?: string | null
  parentServiceId?: number | null
  serviceForTicketType?: number | null
  isActive?: boolean | null
  categories?: string[] | null
  [key: string]: unknown
}

export function transformTag(raw: RawMovideskService): Tag {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'movidesk',
    metadata: strMap({
      parentServiceId: raw.parentServiceId,
      serviceForTicketType: raw.serviceForTicketType,
      isActive: raw.isActive,
    }),
    raw,
  }
}
