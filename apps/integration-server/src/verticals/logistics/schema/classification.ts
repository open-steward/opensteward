/**
 * Field classification for every listable logistics resource — see
 * docs/security/data-classification.md. A logistics address carries a name,
 * phone and email, so every address is `piiAddress` (country kept).
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import {
  CarrierSchema,
  LabelSchema,
  ManifestSchema,
  OrderSchema,
  ShipmentSchema,
  TrackingEventSchema,
  WarehouseSchema,
} from './index'

export const RESOURCE_SCHEMAS = {
  shipments: ShipmentSchema,
  orders: OrderSchema,
  carriers: CarrierSchema,
  warehouses: WarehouseSchema,
  trackingevents: TrackingEventSchema,
  labels: LabelSchema,
  manifests: ManifestSchema,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  shipments: {
    '*': R.internal,
    originAddress: R.piiAddress,
    destinationAddress: R.piiAddress,
    returnAddress: R.piiAddress,
    cost: R.financial,
    notes: R.pii,
    // A label shows the recipient's address.
    labelUrl: R.pii,
  },
  orders: {
    '*': R.internal,
    originAddress: R.piiAddress,
    destinationAddress: R.piiAddress,
    notes: R.pii,
    subtotalAmount: R.financial,
    taxAmount: R.financial,
    shippingAmount: R.financial,
    discountAmount: R.financial,
    totalAmount: R.financial,
    'lineItems[].unitAmount': R.financial,
    'lineItems[].totalAmount': R.financial,
  },
  carriers: { '*': R.internal },
  // The merchant's own facility (allow-listed in the CI check).
  warehouses: { '*': R.internal },
  trackingevents: { '*': R.internal },
  labels: { '*': R.internal, cost: R.financial, url: R.pii, base64: R.pii },
  manifests: { '*': R.internal },
}
