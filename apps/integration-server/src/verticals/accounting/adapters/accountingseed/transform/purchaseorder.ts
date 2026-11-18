import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AccountingSeedPurchaseOrderLineItem {
  Id: string
  Name: string
  AcctSeed__GL_Account__c: string
  AcctSeed__Product__c: string
  AcctSeed__Product_Name__c: string
  AcctSeed__Unit_Price__c: number
  AcctSeed__Quantity__c: number
  AcctSeed__Amount__c: number
  AcctSeed__Tax_Amount__c: number
  [key: string]: unknown
}

export interface AccountingSeedPurchaseOrder {
  Id: string
  Name: string
  AcctSeed__Vendor__c: string
  AcctSeed__Status__c: string
  AcctSeed__Date__c: string
  CurrencyIsoCode: string
  AcctSeed__Total__c: number
  AcctSeed__Tax__c: number
  AcctSeed__Purchase_Order_Lines__r?: { records: AccountingSeedPurchaseOrderLineItem[] }
  AcctSeed__Notes__c: string
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

function mapStatus(raw: AccountingSeedPurchaseOrder): PurchaseOrderStatus {
  const s = (raw.AcctSeed__Status__c ?? '').toLowerCase()
  if (s === 'received' || s === 'completed' || s === 'closed') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void' || s === 'voided') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: AccountingSeedPurchaseOrderLineItem): Lineitem {
  return {
    id: row.Id,
    accountId: row.AcctSeed__GL_Account__c || undefined,
    itemId: row.AcctSeed__Product__c || undefined,
    itemName: row.AcctSeed__Product_Name__c || undefined,
    unitAmount: row.AcctSeed__Unit_Price__c ?? undefined,
    unitQuantity: row.AcctSeed__Quantity__c ?? undefined,
    totalAmount: row.AcctSeed__Amount__c ?? undefined,
    taxAmount: row.AcctSeed__Tax_Amount__c ?? undefined,
  }
}

export function transformPurchaseOrder(raw: AccountingSeedPurchaseOrder): PurchaseOrder {
  const lines = raw.AcctSeed__Purchase_Order_Lines__r?.records ?? []
  return {
    id: raw.Id,
    status: mapStatus(raw),
    contactId: raw.AcctSeed__Vendor__c || undefined,
    currency: raw.CurrencyIsoCode || undefined,
    totalAmount: raw.AcctSeed__Total__c ?? undefined,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.AcctSeed__Date__c ? new Date(raw.AcctSeed__Date__c) : undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    AcctSeed__Vendor__c: order.contactId,
    CurrencyIsoCode: order.currency,
    AcctSeed__Date__c: toCalendarDate(order.postedAt),
    AcctSeed__Purchase_Order_Lines__r: order.lineItems
      ? {
          records: order.lineItems.map((li) => ({
            AcctSeed__Product__c: li.itemId,
            AcctSeed__Product_Name__c: li.itemName,
            AcctSeed__Unit_Price__c: li.unitAmount,
            AcctSeed__Quantity__c: li.unitQuantity,
            AcctSeed__GL_Account__c: li.accountId,
          })),
        }
      : undefined,
  }
}
