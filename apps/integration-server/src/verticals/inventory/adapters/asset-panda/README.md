# Asset Panda adapter

Fixed-asset tracking platform. Assets, and the records of the "Locations" group, are group objects.

Auth: the adapter exchanges the e-mail + password of an Asset Panda user (a service account is recommended) at `POST /v3/session/token`, as the v3 token page documents (https://team-asset-panda.readme.io/reference/post_v3-session-token.md). The page does not document the token response; the adapter reads `token` or `access_token`.

Rate limit: 400 calls per 3-minute window per IP (https://help.assetpanda.com/API_Configuration.html).

## Read methods refuse (501 NOT_SUPPORTED)

`listProducts`, `getProduct`, `listStockLevels`, `getStockLevel`, `listLocations` and `getLocation` all refuse before sending a request.

Group objects are readable only through Search objects, `POST /v3/groups/{group_id}/search/objects` with `limit` and `offset` as query parameters (https://team-asset-panda.readme.io/reference/post_v3-groups-group-id-search-objects.md). Its OpenAPI block documents the 200 response only as `"content": { "application/json": {} }`, and the page shows request samples only. No row key, object field or end-of-list signal is documented. A captured live response would let these methods be rebuilt on that endpoint.

The methods used to post to `/groups/{id}/search-objects` (the ReadMe page slug, not the API path) with limit/offset in the JSON body, after reading `entities` from `GET /v3/groups`, whose documented sample is keyed `groups`. They always returned an empty list. The single-record reads used `GET /v3/entity-objects/{id}`, which the v3 endpoint index (https://team-asset-panda.readme.io/llms.txt) does not list.

## Unsupported resources

- **supplier**, **purchase-order**, **stock-transfer**, **stock-adjustment**: the v3 endpoint index lists no supplier, purchasing, transfer or adjustment endpoints.
- **webhook**: the v3 endpoint index lists no webhook or event-subscription endpoint. `parseWebhookEvents` is not implemented.
