/**
 * Marketplacer Seller API GraphQL documents. Field selections are limited to
 * what `./transform/*.ts` actually maps — see each transform file's header
 * for the doc citation behind every field name.
 *
 * `advertUpsert` / `refundRequestCreate` / `shipmentCreate` and their input
 * type names (`AdvertUpsertMutationInput`, `RefundRequestCreateMutationInput`,
 * `ShipmentCreateMutationInput`) are the Seller API's documented "Reference
 * Docs" mutation set — confirmed against
 * https://api.marketplacer.com/docs/seller-api/reference/mutations/{advertupsert,refundrequestcreate,shipmentcreate}/
 * `variantUpdate` is demonstrated working for sellers in
 * https://api.marketplacer.com/docs/seller-api/examples/products/howto_updateproducts/
 * but is not in that curated nav list; its input type name
 * (`VariantUpdateMutationInput`) follows the same `<Mutation>MutationInput`
 * convention as the other three but is NOT independently confirmed —
 * verify against a live schema/sandbox before relying on it in production.
 */

export const ADVERT_FIELDS = `
  id
  title
  description
  published
  displayable
  online
  lowestPrice
  lowestOriginalPrice
  brand { id name }
  variants(displayableOnly: false) {
    nodes { id label sku barcode countOnHand published displayable buyable }
  }
`

export const LIST_PRODUCTS = `
  query AdvertsWhere($first: Int!, $after: String, $createdSince: ISO8601DateTime) {
    advertsWhere(first: $first, after: $after, createdSince: $createdSince) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { ${ADVERT_FIELDS} }
    }
  }
`

export const GET_PRODUCT = `
  query AdvertNode($id: ID!) {
    node(id: $id) {
      ... on Advert { ${ADVERT_FIELDS} }
    }
  }
`

export const UPSERT_PRODUCT = `
  mutation AdvertUpsert($input: AdvertUpsertMutationInput!) {
    advertUpsert(input: $input) {
      status
      advert { ${ADVERT_FIELDS} }
      errors { field messages }
    }
  }
`

/** See file header — `variantUpdate` input type name is pattern-inferred. */
export const UPDATE_VARIANT = `
  mutation VariantUpdate($input: VariantUpdateMutationInput!) {
    variantUpdate(input: $input) {
      variant { id label sku barcode countOnHand published displayable buyable }
      errors { field messages }
    }
  }
`

/** Minimal Variant lookup used only for inventory reads (no price needed). */
export const GET_VARIANT_STOCK = `
  query VariantStock($id: ID!) {
    node(id: $id) {
      ... on Variant { id countOnHand }
    }
  }
`

export const LIST_TAXONS = `
  query Taxons($first: Int!, $after: String) {
    taxons(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { id displayName treeName }
    }
  }
`

export const GET_TAXON = `
  query TaxonNode($id: ID!) {
    node(id: $id) {
      ... on Taxon { id displayName treeName }
    }
  }
`

export const LIST_INVOICES = `
  query Invoices($first: Int!, $after: String) {
    invoices(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { id legacyId createdAt updatedAt paidAt totalCents statusFlags }
    }
  }
`

export const GET_INVOICE = `
  query InvoiceNode($id: ID!) {
    node(id: $id) {
      ... on Invoice { id legacyId createdAt updatedAt paidAt totalCents statusFlags }
    }
  }
`

const REFUND_REQUEST_FIELDS = `id status invoice { id } lineItems { id reason }`

export const LIST_REFUND_REQUESTS = `
  query RefundRequests($first: Int!, $after: String) {
    refundRequests(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { ${REFUND_REQUEST_FIELDS} }
    }
  }
`

export const GET_REFUND_REQUEST = `
  query RefundRequestNode($id: ID!) {
    node(id: $id) {
      ... on RefundRequest { ${REFUND_REQUEST_FIELDS} }
    }
  }
`

export const CREATE_REFUND_REQUEST = `
  mutation RefundRequestCreate($input: RefundRequestCreateMutationInput!) {
    refundRequestCreate(input: $input) {
      refundRequest { ${REFUND_REQUEST_FIELDS} }
      errors { field messages }
    }
  }
`

export const CREATE_SHIPMENT = `
  mutation ShipmentCreate($input: ShipmentCreateMutationInput!) {
    shipmentCreate(input: $input) {
      shipment { id }
      errors { field messages }
    }
  }
`
