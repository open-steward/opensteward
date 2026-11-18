/**
 * Field classification for every listable inventory resource — see
 * docs/security/data-classification.md.
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import {
  LocationSchema,
  ProductSchema,
  PurchaseOrderSchema,
  StockAdjustmentSchema,
  StockLevelSchema,
  StockTransferSchema,
  SupplierSchema,
} from './index'

export const RESOURCE_SCHEMAS = {
  locations: LocationSchema,
  suppliers: SupplierSchema,
  products: ProductSchema,
  'stock-levels': StockLevelSchema,
  'purchase-orders': PurchaseOrderSchema,
  'stock-transfers': StockTransferSchema,
  'stock-adjustments': StockAdjustmentSchema,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  // The merchant's own warehouse (allow-listed in the CI check).
  locations: { '*': R.internal },
  // A supplier's contact email and phone are often a named person's.
  suppliers: { '*': R.internal, email: R.piiEmail, phone: R.piiPhone },
  products: { '*': R.internal, cost: R.financial, retailPrice: R.financial },
  'stock-levels': { '*': R.internal },
  'purchase-orders': {
    '*': R.internal,
    subtotalAmount: R.financial,
    totalAmount: R.financial,
    'lines[].unitCost': R.financial,
    'lines[].lineTotal': R.financial,
  },
  'stock-transfers': { '*': R.internal },
  'stock-adjustments': { '*': R.internal, adjustedBy: R.piiName, 'lines[].notes': R.pii },
}
