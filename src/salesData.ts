export interface MonthlySales {
  month: string
  /** 今年度の売上（百万円） */
  current: number
  /** 前年度の売上（百万円） */
  previous: number
}

export const salesData: readonly MonthlySales[] = [
  { month: '1月', current: 182, previous: 160 },
  { month: '2月', current: 168, previous: 171 },
  { month: '3月', current: 231, previous: 198 },
  { month: '4月', current: 204, previous: 189 },
  { month: '5月', current: 196, previous: 202 },
  { month: '6月', current: 245, previous: 210 },
  { month: '7月', current: 262, previous: 228 },
  { month: '8月', current: 219, previous: 233 },
  { month: '9月', current: 274, previous: 241 },
  { month: '10月', current: 258, previous: 236 },
  { month: '11月', current: 281, previous: 250 },
  { month: '12月', current: 312, previous: 274 },
]
