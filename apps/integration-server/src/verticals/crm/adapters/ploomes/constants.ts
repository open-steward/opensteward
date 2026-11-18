export const BASE_URL = 'https://api2.ploomes.com'
export const DEFAULT_PAGE_SIZE = 25
/**
 * "Some entities have a resource limit that can be obtained in a GET request.
 * That limit is 300 items for the entities: Contacts, Deals, Cities,
 * Tasks, Orders e Quotes." (https://developers.ploomes.com/json/openapi.json,
 * info.description.en)
 */
export const TASKS_MAX_PAGE_SIZE = 300
