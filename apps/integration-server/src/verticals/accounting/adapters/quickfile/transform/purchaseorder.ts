// QuickFile exposes Purchase_Order methods (PurchaseOrder_Search, etc.) but only
// for purchase orders, which differ from bills. Mapping them requires a separate
// endpoint family; they are deferred for a future increment.
// This file is intentionally minimal; the adapter does not implement listPurchaseOrders.
export {}
