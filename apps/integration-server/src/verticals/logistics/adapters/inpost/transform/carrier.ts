/**
 * ShipX Services → canonical Carrier.
 *
 * InPost is one carrier, so the adapter describes itself as a single Carrier
 * whose `services` are the ShipX service list:
 *   GET /v1/services — "Returns list of all services handled by ShipX." The
 *   response is a bare JSON array of Service resources.
 * Service attributes: `id` ("Unique service identifier."), `name`
 * ("Service name."), `description`, `additional_services`
 * (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153486/).
 */
import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

export interface InPostAdditionalService {
  id: string
  name?: string
  description?: string
}

export interface InPostServiceItem {
  id: string
  name?: string
  description?: string
  additional_services?: InPostAdditionalService[]
}

export const INPOST_CARRIER_ID = 'inpost'

function mapService(raw: InPostServiceItem): CarrierService {
  return { code: raw.id, name: raw.name }
}

export function transformCarrier(services: InPostServiceItem[]): Carrier {
  return {
    id: INPOST_CARRIER_ID,
    name: 'InPost',
    code: INPOST_CARRIER_ID,
    services: services.map(mapService),
    metadata: { services },
  }
}
