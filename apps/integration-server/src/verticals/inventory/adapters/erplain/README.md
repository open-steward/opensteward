# Erplain adapter

B2B inventory and order management SaaS for small businesses.

Auth: a personal bearer token (Edit my profile → Generate new token), sent as
`Authorization: Bearer <token>`. Surfaced via `credentialFields()` as `apiKey`.

Transport: the v2 GraphQL API, one POST endpoint, `https://api.erplain.app/graphql`
(https://erplain.readme.io/v2.0/reference/setup). Read-only.

Pagination: `page` (1-based) and `first` (default 50, max 250); the end comes from
`paginatorInfo.hasMorePages` (https://erplain.readme.io/v2.0/reference/pagination).
Every list is sorted with `orderBy: [{ column: ID, order: ASC }]` so page N is stable.

Supported resources: products (`Products`/`Product`), stock levels (`StockLevels`; one
stock level is read through its documented `ID` filter, because "Querying a single
`StockLevel` by ID is not publicly supported"),
locations (`Locations`/`Location`), suppliers (`Suppliers`/`Supplier`), purchase
orders (`Purchases`/`Purchase`).

## Refused / not supported

- Product images / file URLs
- Supplier banking details / payment terms
- Stock transfers, stock adjustments
- Webhooks (no HMAC/JWT signing documented)
- Customer-facing sales order data
