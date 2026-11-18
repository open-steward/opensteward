import type { Warehouse } from '../../../schema/warehouse'

/**
 * Flexport Logistics API:
 *   GET /logistics/api/2025-03/warehouses/active
 *
 * Response: string[] — an array of warehouse identifier strings.
 * No structured object (name, address, timezone) is returned by this endpoint.
 *
 * Source: https://docs.logistics-api.flexport.com/2025-03/tag/Warehouses/
 */
export type FlexportWarehouseCode = string

export function transformWarehouse(code: FlexportWarehouseCode): Warehouse {
  return {
    id: code,
    code: code,
    metadata: { warehouseCode: code },
  }
}
