import type { Credentials } from '@opensteward/shared'
import { MONDAY_API_URL } from './constants'

export interface MondayColumnValue {
  id: string
  text: string
  type: string
  value: string
}

export interface MondayItem {
  id: string
  name: string
  column_values: MondayColumnValue[]
  [key: string]: unknown
}

export interface MondayUpdate {
  id: string
  body: string
  creator_id: string
  created_at: string
  [key: string]: unknown
}

export interface MondayBoard {
  id: string
  name: string
  columns: Array<{
    id: string
    title: string
    type: string
    settings_str: string
  }>
}

export interface MondayItemsPage {
  cursor: string | null
  items: MondayItem[]
}

/** Lightweight GraphQL client for Monday.com's single-endpoint API. */
export class MondayClient {
  constructor(private credentials: Credentials) {}

  async query<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'API-Version': '2024-01',
      },
      body: JSON.stringify({ query: gql, variables }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Monday.com API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }

    const json = await res.json() as { data?: T; errors?: Array<{ message: string }> }
    if (json.errors?.length) {
      throw new Error(`Monday.com GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`)
    }
    if (!json.data) throw new Error('Monday.com: empty data response')
    return json.data
  }
}

/** Extract the `.text` value of a named column from an item's column_values array. */
export function getColumnValue(item: MondayItem, colId: string): string | undefined {
  const col = item.column_values.find((c) => c.id === colId)
  return col?.text || undefined
}
