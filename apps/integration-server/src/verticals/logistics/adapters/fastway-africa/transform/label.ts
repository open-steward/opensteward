import type { Label } from '../../../schema/label'
import type { FastwayAfricaShipment } from './shipment'

// --- Derived label transform ------------------------------------------------
// Fastway Africa does not expose a dedicated label resource.  The label PDF
// URL (`label_url`) is returned as part of the shipment/consignment response.
// A Label is therefore derived from that field.

export function transformLabel(raw: FastwayAfricaShipment): Label {
  return {
    id: raw.shipmentId,
    shipmentId: raw.shipmentId,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'fastway-africa',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
