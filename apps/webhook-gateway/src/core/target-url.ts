/**
 * Builds the integration-server URL an inbound webhook is forwarded to.
 *
 * The destination route is `/webhooks/:vertical/:platform` — see
 * `packages/shared/src/control-plane/webhooks-router.ts`. Both params are
 * required; omitting the vertical yields a 404 at the destination.
 *
 * Kept as a standalone pure function, not inlined in the route handler, so
 * `tests/unit/target-url.test.ts` can assert the real shipping code rather
 * than a copy of it.
 */
export function buildTargetUrl(baseUrl: string, vertical: string, platform: string): string {
  // The base is operator-supplied (config.yml, or INTEGRATION_SERVER_URL in a
  // container), so a trailing slash is realistic and would produce
  // `//webhooks/...`, which does not match the route.
  return `${baseUrl.replace(/\/+$/, '')}/webhooks/${vertical}/${platform}`
}
