import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface AccountingSeedOrderLineItem {
  Id: string
  Name: string
  AcctSeed__GL_Account__c: string
  AcctSeed__Product__c: string
  AcctSeed__Product_Name__c: string
  AcctSeed__Unit_Price__c: number
  AcctSeed__Quantity__c: number
  AcctSeed__Amount__c: number
  AcctSeed__Tax_Amount__c: number
  AcctSeed__Discount__c: number
  [key: string]: unknown
}

export interface AccountingSeedOrder {
  Id: string
  Name: string
  AcctSeed__Customer__c: string
  AcctSeed__Status__c: string
  AcctSeed__Date__c: string
  CurrencyIsoCode: string
  AcctSeed__Total__c: number
  AcctSeed__Tax__c: number
  AcctSeed__Order_Lines__r?: { records: AccountingSeedOrderLineItem[] }
  AcctSeed__Notes__c: string
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

function mapStatus(raw: AccountingSeedOrder): OrderStatus {
  const s = (raw.AcctSeed__Status__c ?? '').toLowerCase()
  if (s === 'completed' || s === 'invoiced' || s === 'closed') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void' || s === 'voided') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: AccountingSeedOrderLineItem): Lineitem {
  return {
    id: row.Id,
    accountId: row.AcctSeed__GL_Account__c || undefined,
    itemId: row.AcctSeed__Product__c || undefined,
    itemName: row.AcctSeed__Product_Name__c || undefined,
    unitAmount: row.AcctSeed__Unit_Price__c ?? undefined,
    unitQuantity: row.AcctSeed__Quantity__c ?? undefined,
    totalAmount: row.AcctSeed__Amount__c ?? undefined,
    taxAmount: row.AcctSeed__Tax_Amount__c ?? undefined,
    discountAmount: row.AcctSeed__Discount__c ?? undefined,
  }
}

export function transformOrder(raw: AccountingSeedOrder): Order {
  const lines = raw.AcctSeed__Order_Lines__r?.records ?? []
  return {
    id: raw.Id,
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.AcctSeed__Customer__c || undefined,
    currency: raw.CurrencyIsoCode || undefined,
    totalAmount: raw.AcctSeed__Total__c ?? undefined,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.AcctSeed__Date__c ? new Date(raw.AcctSeed__Date__c) : undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    AcctSeed__Customer__c: order.contactId,
    CurrencyIsoCode: order.currency,
    AcctSeed__Date__c: toCalendarDate(order.postedAt),
    AcctSeed__Order_Lines__r: order.lineItems
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
