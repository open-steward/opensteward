/**
 * A stand-in for `AdminApiClient` in journey tests.
 *
 * Every journey test mocks that client. A hand-rolled class carrying only the
 * methods its author thinks the routes need cannot keep up: the client has
 * over a hundred, so any route that grows a new `apiClient` call breaks an
 * arbitrary number of unrelated test files.
 *
 * And the failure never looks like its cause. Reading a method that does not
 * exist throws *synchronously*, before a promise exists, so the route's own
 * `.catch(() => [])` cannot absorb it:
 *
 *   - In a route it becomes a 500, attributed to whatever the page was doing —
 *     a test that scrapes its CSRF token out of the rendered page sees a 403,
 *     because the page is an error page.
 *   - In the wizard's progress preHandler it is silent: the catch swallows it
 *     and the whole rail stops rendering, with nothing logged.
 *
 * So the stub answers for everything, and chooses its default by what the name
 * says the method does.
 *
 * **Reads default; writes throw.** The calls a route grows are reads it makes
 * incidentally — never a write a test cared about — so defaulting reads is
 * what removes the churn. Writes stay explicit because they are what tests
 * assert on, and a silent `{}` would let a test pass while exercising
 * nothing.
 */

/** `async () => []` etc., keyed by the prefix the real client uses. */
const READ_DEFAULTS: ReadonlyArray<[string, () => unknown]> = [
  ['list', () => []],
  ['get', () => null],
]

/**
 * Reads whose honest default is not empty.
 *
 * `hasUsers` is the whole `has*` family, and a prefix rule got it exactly
 * backwards: `false` means "nobody has installed this yet", so the first-run
 * guard redirects every admin page to /setup/init and every test sees a 302 with
 * an empty body. A test that has not said otherwise is exercising an installed
 * deployment, so it answers true.
 *
 * Kept as an explicit list rather than a cleverer rule: booleans have no safe
 * default, only a correct one per method.
 */
export const NAMED_DEFAULTS: Readonly<Record<string, () => unknown>> = {
  hasUsers: () => true,
  // Every deployment is seeded with a `default` tenant, so `[]` describes a
  // state that cannot exist — and the pages that branch on `tenants.length > 1`
  // read differently against a list that is empty rather than merely singular.
  // Three files had to override this back to reality before it was a default.
  listTenants: () => [{ id: 'default', name: 'Default' }],

  // The six methods whose name lies about their shape. A prefix rule guesses at
  // the return type, and for these it guesses wrong — which is worse than not
  // guessing: the caller destructures a plausible-looking value and fails
  // somewhere else entirely, instead of getting this file's named error.
  //
  //   `const { data, meta } = await listConnectionsPaged(...)`  against []
  //     -> both undefined -> 500 pointing at connections/index.ejs
  //   `verticals.some(v => v.adapterCount > 0)`  against null
  //     -> TypeError thrown AFTER orEmpty, swallowed by the wizard preHandler,
  //        and the nav rail silently stops rendering
  //
  // `stub-matches-client.test.ts` fails if the client ever grows another.
  getVerticals: () => [],
  listConnectionsPaged: () => emptyPage(),
  listEndUsersPaged: () => emptyPage(),
  listSyncJobsPaged: () => emptyPage(),
  listWebhookDeliveriesPaged: () => emptyPage(),
  listAudit: () => emptyPage(),

  // A count, not a record: `get*`'s null would be read as a number wherever
  // the bell renders it, and "0 unread" is the only honest default for a
  // deployment nothing has been said about.
  getUnreadNotificationCount: () => 0,
}

/** The `{ data, meta }` envelope the paginated reads answer with. */
function emptyPage() {
  return { data: [], meta: { page: 1, limit: 50, total: 0 } }
}

/**
 * Properties that belong to JavaScript, not to AdminApiClient — answered from
 * the real object rather than stubbed.
 *
 * `then` is the dangerous one: anything with a callable `then` is a thenable, so
 * `await client`, or merely returning the stub from an async function, would try
 * to unwrap it and hang. Reflecting to the target gives `undefined` there, which
 * is exactly right.
 *
 * `toString` and `valueOf` are the mirror image: they must resolve to the real
 * implementations, or interpolating the stub into a string throws from inside
 * the runtime — far from anything a reader would connect to this file.
 */
const PASSTHROUGH: ReadonlySet<string> = new Set([
  'then',
  'catch',
  'finally',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'toJSON',
  'inspect',
])

function defaultFor(name: string): () => Promise<unknown> {
  // hasOwnProperty, not plain indexing — the same trap guarded for `overrides`
  // in the get trap below. `NAMED_DEFAULTS['hasOwnProperty']` finds
  // Object.prototype's copy and reads as a configured default, so
  // `stub.hasOwnProperty('x')` would answer a resolved promise instead of
  // throwing. No client method collides today; the next one would do so
  // silently.
  if (Object.prototype.hasOwnProperty.call(NAMED_DEFAULTS, name)) {
    const named = NAMED_DEFAULTS[name]
    return async () => named()
  }
  for (const [prefix, value] of READ_DEFAULTS) {
    // `getX`, not `getter` — the char after the prefix must start a new word,
    // or `hasty`/`listen`-shaped names would silently read as reads.
    if (name.startsWith(prefix) && /[A-Z]/.test(name.charAt(prefix.length))) {
      return async () => value()
    }
  }
  return () => {
    throw new Error(
      `AdminApiClient.${name} was called but not stubbed in this test. ` +
        `It is not a read (list*/get*), so there is no safe default — ` +
        `pass it explicitly: adminApiStub({ ${name}: vi.fn() }).`,
    )
  }
}

/**
 * Build a mock `AdminApiClient` class.
 *
 * Pass only what the test actually cares about; everything else answers with a
 * read default or throws by name. Overrides may be `vi.fn()` (to assert on
 * calls) or plain functions — both existing mock styles keep working unchanged.
 *
 * ```ts
 * vi.mock('../../src/core/proxy/admin-api-client', async () => {
 *   const { adminApiStub } = await import('../helpers/admin-api-stub')
 *   return { AdminApiClient: adminApiStub({ listWebhookSubs: mockListWebhookSubs }) }
 * })
 * ```
 *
 * The `await import` is required: `vi.mock` is hoisted above the file's imports,
 * so the helper cannot be a top-level binding — but the factory body runs later,
 * by which time it can import anything.
 */
export function adminApiStub(overrides: Record<string, unknown> = {}) {
  return class AdminApiClientStub {
    constructor() {
      return new Proxy(this, {
        get(target, prop, receiver) {
          // Symbols reach here for `Symbol.toPrimitive`, `Symbol.toStringTag`
          // and friends. Answer them from the real object: handing back a stub
          // function makes `String(client)` throw from inside the runtime.
          if (typeof prop !== 'string') return Reflect.get(target, prop, receiver)
          // hasOwnProperty, not `in`: every object inherits `toString`, so `in`
          // would treat it as an override the caller never wrote.
          if (Object.prototype.hasOwnProperty.call(overrides, prop)) return overrides[prop]
          if (PASSTHROUGH.has(prop)) return Reflect.get(target, prop, receiver)
          return defaultFor(prop)
        },
      })
    }
  }
}
