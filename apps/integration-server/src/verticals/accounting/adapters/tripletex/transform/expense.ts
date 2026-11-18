import type { Expense } from '../../../schema/expense'

export interface TripletexTravelExpense {
  id: number
  description: string
  employee?: { id: number; displayName: string }
  travelDetails?: { departureDate: string }
  amount: number
  amountCurrency: number
  currency?: { id: string; code: string }
  isCompleted: boolean
  [key: string]: unknown
}

export function transformExpense(raw: TripletexTravelExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    userId: raw.employee?.id ? String(raw.employee.id) : undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amountCurrency,
    postedAt: raw.travelDetails?.departureDate
      ? new Date(raw.travelDetails.departureDate)
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
