/**
 * https://docs.espocrm.com/development/api/ ("Date and time values"):
 * "Date format: YYYY-MM-DD. Datetime format: YYYY-MM-DD HH:mm:ss. All
 * datetime values are represented in UTC timezone, regardless of the
 * settings." The API reference (docs.espocrm.com/api/spec.json) gives
 * createdAt the pattern ^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$ and
 * "A timestamp in UTC.", and closeDate {"format": "date"}.
 */
const ESPO_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/
const ESPO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** An EspoCRM datetime (UTC) as ISO 8601; absent stays absent, any other shape throws. */
export function espoDatetimeToIso(value: string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined
  const m = ESPO_DATETIME.exec(value)
  if (!m) throw new Error(`EspoCRM datetime "${value}" is not "YYYY-MM-DD HH:mm:ss"`)
  return `${m[1]}T${m[2]}Z`
}

/** An EspoCRM date as midnight UTC of that day; absent stays absent, any other shape throws. */
export function espoDateToIso(value: string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined
  if (!ESPO_DATE.test(value)) throw new Error(`EspoCRM date "${value}" is not "YYYY-MM-DD"`)
  return `${value}T00:00:00Z`
}
