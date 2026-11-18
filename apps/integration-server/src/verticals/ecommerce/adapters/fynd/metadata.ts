export const metadata = {
  platform: 'fynd',
  totalResources: 11,
  availableResources: [
    'product',
    'collection',
    'location',
    'inventory',
    'customer',
    'order',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'variant',
      reason:
        "Fynd's catalog API models a purchasable SKU as a `size` string on the parent product plus a store-scoped inventory \"article\" (`GET catalog/v1.0/company/{id}/inventories`, filtered by item_id+size) — there is no company-wide, store-independent variant resource with a single stable price, and no documented endpoint to create, update, or delete an individual size as a standalone object (only bulk size-upload jobs and a `deleteSize` call that mutates the parent product's size list). Not verifiable as a discrete CRUD resource against Fynd's public Platform API reference.",
    },
    {
      resource: 'fulfillment',
      reason:
        "Fynd's OMS exposes shipments via `GET order/v1.0/company/{id}/shipments-listing` / `shipment-details`, but the response (`OrderPlatformModel.ShipmentItem`/`PlatformShipment`) nests line items under `bags` (each carrying `financial_breakup`, `gst`, `article` sub-objects) and has no documented trackingNumber/carrier field — tracking is set via a separate `POST order-manage/v1.0/.../tracking` call whose result isn't surfaced back on the shipment. Mapping to the canonical Fulfillment shape isn't verifiable to the precision this rebuild requires.",
    },
    {
      resource: 'refund',
      reason:
        "Fynd's OMS has no standalone refund REST resource in the public Platform API reference — refunds surface only as per-bag `financial_breakup`/`refund_amount` fields nested inside a shipment, with the actual mode/processing handled by `fetchRefundModeConfig` and internal state-transition workflows, not a creatable/listable Refund object.",
    },
    {
      resource: 'transaction',
      reason:
        'Payment transactions are not a standalone Order/Payment Platform API resource for Fynd; `payment_info`/`payment_methods` are untyped (`Joi.object().pattern(/\\S/, Joi.any())`) fields embedded in the order/shipment response with no documented schema and no list/get/create endpoint of their own.',
    },
  ],
} as const
