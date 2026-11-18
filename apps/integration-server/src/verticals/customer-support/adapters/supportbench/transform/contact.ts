/**
 * Supportbench contact → canonical Contact transform.
 *
 * Supportbench contacts are returned from GET /search/contact/:terms.
 * Contact fields: result_type, id, name, support_level_id, support_level,
 * support_level_color, email, company_id, active.
 *
 * A full contact record returned from GET /contact/:id also includes
 * phone, title, description, and custom fields[].
 *
 * Docs: https://supportbench.readme.io/reference/search-for-contact-by-name.md
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSupportbenchContact {
  id?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  title?: string | null
  description?: string | null
  company_id?: string | null
  company?: string | null
  support_level_id?: string | null
  support_level?: string | null
  support_level_color?: string | null
  active?: string | boolean | null
  result_type?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawSupportbenchContact): Contact {
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    organizationId: pickStr(raw.company_id) ?? undefined,
    platform: 'supportbench',
    metadata: strMap({
      support_level: raw.support_level,
      support_level_id: raw.support_level_id,
      title: raw.title,
      active: raw.active,
    }),
    raw,
  }
}
