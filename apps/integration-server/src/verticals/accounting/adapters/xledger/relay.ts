/**
 * Xledger's Relay connections, as the first-party documents describe them.
 *
 * Paging (GraphQL Documentation, the Google Doc linked from
 * https://github.com/xledger/graphql-samples,
 * https://docs.google.com/document/d/1F6l7Pb6nsnfEHsnxj8AF91iSjiRr73AFAKmVtbpRV2M):
 *   "For pagination, Xledger supports the Relay pagination specification."
 *   "If there is a next page, and you want to get the next one, specify the
 *    "after" field, and use one of the cursors (for example, the last one) to
 *    get the first N records after that one."
 *
 * The cursor lives on each edge, and the end is `pageInfo.hasNextPage`
 * ("GraphQL pagination",
 * https://xledgerukinternal.zendesk.com/hc/en-us/articles/23685633055250):
 *   "using the first qualifier will pull the first modified customers, each
 *    records will have a cursor attached (in most cases the dbId)"
 *   "The response will inform of two things : The last cursor to use in the
 *    next query / If another query is necessary thanks to the hasNextPage boolean"
 * Xledger's own sample (graphql-samples, Webhooks-CSharp/GraphQL/Queries.cs)
 * selects exactly `edges { cursor node { ... } }` and `pageInfo { hasNextPage }`
 * with `query ($after: String) { projects(first: 10000, after: $after) ...`.
 * No document names a `pageInfo.endCursor`, so none is selected.
 *
 * An empty connection answers `"edges": null` ("Create or update customer",
 * https://xledgerukinternal.zendesk.com/hc/en-us/articles/8681708023698).
 */
import type { CursorPage } from '@opensteward/shared'
import { parseDecimal } from '../shared/transform'

/**
 * The page ceiling: "Xledger's API has a limit of 10000 records per query"
 * (GraphQL pagination, article 23685633055250), and "make sure you are using
 * the biggest page size you can (10 000)" (GraphQL Documentation).
 */
export const MAX_PAGE_SIZE = 10_000

export interface RelayEdge<T> {
  cursor: string
  node: T
}

export interface RelayConnection<T> {
  edges: Array<RelayEdge<T>> | null
  pageInfo: { hasNextPage: boolean }
}

/**
 * One page of the connection `root`, selecting `selection` on each node, at
 * `first` rows after cursor `after`. `first` is an integer this adapter
 * computes, so it is written into the query the way Xledger's sample writes
 * `first: 10000`; `after` is a variable typed `String`, as in that sample.
 */
export function connectionQuery(root: string, first: number, selection: string): string {
  return `query ($after: String) { ${root}(first: ${first}, after: $after) { edges { cursor node { ${selection} } } pageInfo { hasNextPage } } }`
}

/**
 * One record by id. Xledger's GraphQL Documentation: "GraphQL queries in
 * Xledger come in two forms: one for fetching a single record, and one for
 * fetching multiple. For example, the type "Employee" has both top level
 * fields, "employee(…)" for fetching 1 by id, and "employees(…)" to fetch
 * many." Its sample fetches one by id as
 * `query($dbId: ID) { webhook(dbId: $dbId) { ... } }` (Queries.cs).
 */
export function recordQuery(root: string, selection: string): string {
  return `query ($dbId: ID) { ${root}(dbId: $dbId) { ${selection} } }`
}

/**
 * The rows of one connection page and the cursor that starts the next: the
 * last edge's cursor while `hasNextPage` is true, else none.
 *
 * A response with no connection throws rather than reading as an empty, and
 * therefore complete, collection. A next cursor equal to the one the page was
 * fetched with is caught by `pageByRows` itself ("names itself as the next
 * page"), so it is not checked again here.
 */
export function relayPage<T>(
  root: string,
  conn: RelayConnection<T> | null | undefined,
): CursorPage<T, string> & { next: string | undefined } {
  if (!conn) throw new Error(`Xledger ${root}: the response carried no ${root} connection`)
  const edges = conn.edges ?? []
  if (!conn.pageInfo?.hasNextPage) return { items: edges.map((e) => e.node), next: undefined }
  const last = edges[edges.length - 1]
  if (!last) throw new Error(`Xledger ${root}: hasNextPage is true on a page with no edges`)
  return { items: edges.map((e) => e.node), next: last.cursor }
}

/**
 * A subledger (AR or AP) transaction node, with only the fields the
 * first-party "Customer invoices" (8703588077330) and "Supplier invoices"
 * (8714771914898) articles select and show in their example responses:
 *   `dbId invoiceNumber invoiceRemaining invoiceAmount reconciled extIdentifier`
 * e.g. `"dbId": 139977188, "invoiceNumber": "A", "invoiceRemaining": "0.0000",
 * "invoiceAmount": "200.0000", "reconciled": true, "extIdentifier": "1000239"`.
 */
export interface XledgerSubledgerTransaction {
  dbId: number
  invoiceNumber?: string | null
  invoiceRemaining?: string | null
  invoiceAmount?: string | null
  reconciled?: boolean | null
  extIdentifier?: string | null
  [key: string]: unknown
}

export const SUBLEDGER_TRANSACTION_FIELDS =
  'dbId invoiceNumber invoiceRemaining invoiceAmount reconciled extIdentifier'

/**
 * Invoice or credit note. The articles tell them apart only by the sign of
 * `invoiceAmount`: in the "Fully refunded/credited" example the invoice is
 * `"invoiceAmount": "200.0000"` and the credit note `"-200.0000"`, and in the
 * supplier article "In the event of a refund/credit from the supplier ... you
 * would expect a GLImportItem as well albeit with a negative amount". A row
 * with no parseable amount, or zero, is neither.
 */
export function subledgerKind(raw: XledgerSubledgerTransaction): 'invoice' | 'credit' | undefined {
  const amount = parseDecimal(raw.invoiceAmount)
  if (amount === undefined || amount === 0) return undefined
  return amount > 0 ? 'invoice' : 'credit'
}
