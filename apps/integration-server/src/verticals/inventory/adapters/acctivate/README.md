# Acctivate Inventory Software adapter

Acctivate has no pull API. First-party
[ConfigurationWebStore](https://docs.acctivate.com/docs/ConfigurationWebStore.html):

> Acctivate does not provide a "Web Services API". Instead, we leverage the
> existing API provided by your shopping cart / eCommerce platform.

The [Native web store protocol](https://docs.acctivate.com/docs/IntegrationWebStoreNative.html)
is one a web store implements for Acctivate's desktop Web Store Sync to call
("The Native web store template requires a web developer to implement a web
service that uses Acctivate's native XML schema."). Inventory leaves Acctivate
only in the `UpdateInventory` POST it sends to that web store, so no documented
endpoint returns products or quantities to a caller.

## Resources

| Resource          | Status                                                            |
| ----------------- | ----------------------------------------------------------------- |
| Products          | `listProducts` refuses with 501 `NOT_SUPPORTED`, sends nothing    |
| Stock Levels      | `listStockLevels` refuses with 501 `NOT_SUPPORTED`, sends nothing |
| Locations         | not implemented, router returns 501                               |
| Suppliers         | not implemented, router returns 501                               |
| Purchase Orders   | not implemented, router returns 501                               |
| Stock Adjustments | not implemented, router returns 501                               |
| Stock Transfers   | not implemented, router returns 501                               |
| Webhooks          | no documented webhook or signature-verification mechanism         |

The credential fields (web-store service URL, username, password) are the
values a web store issues to Acctivate for the Native protocol. No method
uses them.
