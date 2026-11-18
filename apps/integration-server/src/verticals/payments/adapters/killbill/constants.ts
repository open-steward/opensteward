/**
 * Page size for Kill Bill's `/pagination` endpoints: the documented default of
 * `limit` ("long | false | 100 | Maximum number of items to be listed",
 * https://killbill.github.io/slate/account.html, List accounts). No maximum is
 * documented. Used as the caller default and as the upstream page size when
 * rows are flattened out of parent records.
 */
export const DEFAULT_PAGE_SIZE = 100
