/**
 * Page size used when a caller names no limit: Krayin's own default.
 * krayin/rest-api src/Http/Controllers/V1/Controller.php, allResources():
 * `return $query->paginate(request()->input('limit') ?? 10);`
 * No maximum is applied to `limit`, so the adapter declares none.
 */
export const DEFAULT_PAGE_SIZE = 10
