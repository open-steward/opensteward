/**
 * SAP EWM stock-transfer transform.
 *
 * Source: SAP S/4HANA Warehouse Order and Task OData v2 service.
 *   API name : API_WAREHOUSE_ORDER_TASK_2
 *   Entity set: WarehouseTask (transfer-order level)
 *   Key fields: WarehouseNumber + WarehouseOrder + WarehouseTask
 *
 * A Warehouse Task in SAP EWM is a movement instruction: pick from source bin
 * and place in destination bin.  We map one WarehouseTask to one StockTransfer
 * line; the parent WarehouseOrder groups them.  The adapter groups tasks by
 * WarehouseOrder to return one StockTransfer per order.
 *
 * Transfer status (ConfirmationStatus):
 *   A = created / open, B = confirmed / completed, C = cancelled
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickNum, strMap, toIso} from './shared'

/** A single warehouse task (movement line). */
export interface RawSapEwmWarehouseTask {
  /** Warehouse number */
  WarehouseNumber: string
  /** Parent warehouse order */
  WarehouseOrder: string
  /** Task number */
  WarehouseTask: string
  /** Product */
  Product?: string
  /** Source storage type */
  EWMSrcStorageType?: string
  /** Source storage bin */
  EWMSrcStorageBin?: string
  /** Destination storage type */
  EWMDestStorageType?: string
  /** Destination storage bin */
  EWMDestStorageBin?: string
  /** Requested quantity */
  RequestedQuantity?: string | number
  /** Actual/confirmed quantity */
  ActualQuantity?: string | number
  /** Base unit */
  BaseUnit?: string
  /** Confirmation status (A/B/C) */
  ConfirmationStatus?: string
  /** Creation time as /Date(ms)/ */
  CreationDateTime?: string
  /** Confirmation time */
  ConfirmationDateTime?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch (s ?? '') {
    case 'B': return 'completed'
    case 'C': return 'cancelled'
    case 'A':
    default:  return 'in_transit'
  }
}

/**
 * Transform a single Warehouse Task into a StockTransfer record.
 * Callers may also group tasks by WarehouseOrder to produce aggregated records.
 */
export function transformStockTransfer(raw: RawSapEwmWarehouseTask): StockTransfer {
  const id = `${raw.WarehouseNumber}:${raw.WarehouseOrder}:${raw.WarehouseTask}`

  const fromLocationId = raw.EWMSrcStorageBin
    ? `${raw.WarehouseNumber}:${raw.EWMSrcStorageType ?? ''}:${raw.EWMSrcStorageBin}`
    : raw.WarehouseNumber

  const toLocationId = raw.EWMDestStorageBin
    ? `${raw.WarehouseNumber}:${raw.EWMDestStorageType ?? ''}:${raw.EWMDestStorageBin}`
    : raw.WarehouseNumber

  const status = mapStatus(raw.ConfirmationStatus)

  return {
    id,
    externalId: id,
    number: raw.WarehouseOrder,
    fromLocationId,
    toLocationId,
    status,
    lines: [
      {
        productId: raw.Product ?? '',
        quantity: pickNum(raw.RequestedQuantity) ?? 0,
        quantityReceived: pickNum(raw.ActualQuantity),
      },
    ],
    shippedAt: toIso(raw.CreationDateTime),
    receivedAt: status === 'completed' ? toIso(raw.ConfirmationDateTime) : undefined,
    platform: 'sap-ewm',
    metadata: strMap({
      warehouseNumber: raw.WarehouseNumber,
      warehouseOrder: raw.WarehouseOrder,
      warehouseTask: raw.WarehouseTask,
      ewmSrcStorageType: raw.EWMSrcStorageType,
      ewmSrcStorageBin: raw.EWMSrcStorageBin,
      ewmDestStorageType: raw.EWMDestStorageType,
      ewmDestStorageBin: raw.EWMDestStorageBin,
      baseUnit: raw.BaseUnit,
      confirmationStatus: raw.ConfirmationStatus,
    }),
    raw,
  }
}
