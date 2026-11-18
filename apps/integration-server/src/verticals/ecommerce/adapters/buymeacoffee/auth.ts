/**
 * Buy Me a Coffee auth helpers.
 *
 * Buy Me a Coffee uses a personal access token rather than OAuth2. Creators
 * copy their token from Settings → API in the Buy Me a Coffee dashboard and
 * supply it as `credentials.accessToken`. The token is long-lived and does
 * not require refreshing.
 *
 * There is no authorization URL, no code exchange, and no token refresh.
 *
 * Credentials layout:
 *  - `accessToken`  Buy Me a Coffee personal access token (long-lived)
 *
 * Docs: https://developers.buymeacoffee.com/
 */

// This file is intentionally minimal — no OAuth2 helpers are needed.
// The auth stubs live in the adapter class (index.ts) per the EcommerceAdapter
// contract. This module exists for structural consistency with other adapters
// and as the extension point if Buy Me a Coffee ever ships an OAuth2 flow.
