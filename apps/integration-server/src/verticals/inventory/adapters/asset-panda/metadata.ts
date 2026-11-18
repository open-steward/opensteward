export const metadata = {
  platform: 'asset-panda',
  totalResources: 7,
  availableResources: [],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason:
        'Asset Panda is a fixed-asset tracking platform. Its v3 REST API has no purchase-order, procurement, or supplier endpoints — confirmed via official llms.txt endpoint index.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'Asset Panda has no stock-adjustment concept or endpoint. Asset quantity is a custom field on individual objects; there is no bulk adjustment ledger in the API.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Asset Panda has no stock-transfer or location-movement endpoint. The API does not model inventory movements between locations.',
    },
    {
      resource: 'supplier',
      reason:
        'Asset Panda has no supplier/vendor endpoint. The platform does not expose procurement data through its REST API.',
    },
    {
      resource: 'location',
      reason:
        'Group objects are readable only through Search objects (POST /v3/groups/{group_id}/search/objects), whose 200 response is documented only as "Successful response", "content": { "application/json": {} } (https://team-asset-panda.readme.io/reference/post_v3-groups-group-id-search-objects.md)',
    },
    {
      resource: 'product',
      reason:
        'Group objects are readable only through Search objects (POST /v3/groups/{group_id}/search/objects), whose 200 response is documented only as "Successful response", "content": { "application/json": {} } (https://team-asset-panda.readme.io/reference/post_v3-groups-group-id-search-objects.md)',
    },
    {
      resource: 'stock-level',
      reason:
        'Group objects are readable only through Search objects (POST /v3/groups/{group_id}/search/objects), whose 200 response is documented only as "Successful response", "content": { "application/json": {} } (https://team-asset-panda.readme.io/reference/post_v3-groups-group-id-search-objects.md)',
    },
  ],
} as const
