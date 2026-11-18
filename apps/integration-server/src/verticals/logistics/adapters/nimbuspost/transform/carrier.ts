/**
 * NimbusPost — carrier transform
 *
 * GET /courier returns the list of courier partners enabled for the account.
 * Confirmed endpoint: https://github.com/tech-nimbuspost/nimbuspost-api/blob/main/src/Module/V2/CourierModule.php
 * Postman docs: https://documenter.getpostman.com/view/9692837/TW6wHnoz
 */
import type { Carrier } from '../../../schema/carrier'

export interface NimbusPostCourierRaw {
  id?: string | number | null
  name?: string | null
  code?: string | null
  slug?: string | null
  tracking_url?: string | null
  is_active?: boolean | number | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface NimbusPostCourierListResponse {
  status?: boolean
  message?: string
  data?: NimbusPostCourierRaw[]
  [key: string]: unknown
}

export function transformCarrier(raw: NimbusPostCourierRaw): Carrier {
  const code = raw.code ?? raw.slug ?? (raw.id != null ? String(raw.id) : undefined)
  const trackingUrl = raw.tracking_url ?? undefined

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    code,
    trackingUrlTemplate: trackingUrl,
    isActive: typeof raw.is_active === 'boolean'
      ? raw.is_active
      : raw.is_active != null
        ? raw.is_active !== 0
        : true,
    metadata: raw as Record<string, unknown>,
  }
}
