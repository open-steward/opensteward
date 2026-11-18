export const metadata = {
  platform: '1centerprise',
  totalResources: 13,
  availableResources: [],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `ChartOfAccounts` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/ChartOfAccounts returns a 404 HTML page, not OData)",
    },
    {
      resource: 'bill',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `InvoiceIn` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/InvoiceIn returns a 404 HTML page, not OData)",
    },
    {
      resource: 'contact',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `Counterparty` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/Counterparty returns a 404 HTML page, not OData)",
    },
    {
      resource: 'creditmemo',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `CorrectionInvoice` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/CorrectionInvoice returns a 404 HTML page, not OData)",
    },
    {
      resource: 'expense',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `ExpenseReport` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/ExpenseReport returns a 404 HTML page, not OData)",
    },
    {
      resource: 'invoice',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `InvoiceOut` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/InvoiceOut returns a 404 HTML page, not OData)",
    },
    {
      resource: 'journal',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `AccountingRegisterRecordset` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/AccountingRegisterRecordset returns a 404 HTML page, not OData)",
    },
    {
      resource: 'order',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `Order` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/Order returns a 404 HTML page, not OData)",
    },
    {
      resource: 'organization',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `Organization` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/Organization returns a 404 HTML page, not OData)",
    },
    {
      resource: 'purchaseorder',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `PurchaseOrder` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/PurchaseOrder returns a 404 HTML page, not OData)",
    },
    {
      resource: 'salesorder',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `SalesOrder` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/SalesOrder returns a 404 HTML page, not OData)",
    },
    {
      resource: 'taxrate',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `TaxRate` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/TaxRate returns a 404 HTML page, not OData)",
    },
    {
      resource: 'transaction',
      reason:
        "1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `AccumulationRegisterRecordset` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/AccumulationRegisterRecordset returns a 404 HTML page, not OData)",
    },
  ],
} as const
