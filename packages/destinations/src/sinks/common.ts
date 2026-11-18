/** Helpers shared by the object-store sinks. */

/**
 * Where "test connection" writes its probe object (relative to the prefix).
 * One fixed key, overwritten each time, so testing never accumulates files.
 */
export function connectionTestPath(): string {
  return '_opensteward/connection-test.json'
}
