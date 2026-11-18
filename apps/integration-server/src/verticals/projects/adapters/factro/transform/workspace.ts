/**
 * Factro "workspace" transform.
 *
 * Factro does not have a first-class workspace or organisation object in its
 * public REST API. The `mandantId` field (tenant ID) on every resource acts as
 * the workspace identifier. We synthesise a minimal Workspace record from the
 * company object, which is the closest analogue.
 *
 * Company fields (camelCase JSON):
 *   id, name, description, shortName, city, street, zipCode, emailAddress,
 *   phone, website, companyNumber, customerId
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFactroCompany {
  id: string
  name?: string
  description?: string
  shortName?: string
  city?: string
  emailAddress?: string
  website?: string
  companyNumber?: number
  customerId?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawFactroCompany): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    platform: 'factro',
    metadata: strMap({
      shortName: raw.shortName,
      city: raw.city,
      emailAddress: raw.emailAddress,
      website: raw.website,
      companyNumber: raw.companyNumber,
      customerId: raw.customerId,
    }),
    raw,
  }
}
