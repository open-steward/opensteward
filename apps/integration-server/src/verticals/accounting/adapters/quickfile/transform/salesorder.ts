// QuickFile does not expose a sales order / estimate-list endpoint that maps to
// the canonical SalesOrder resource. Estimates are a sub-type of Invoice_Search
// but there is no separate SalesOrder resource in the QuickFile API.
// This file is intentionally minimal; the adapter does not implement listSalesOrders.
export {}
