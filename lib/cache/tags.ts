export const CACHE_TAGS = {
  attendance: 'attendance',
  adminReport: 'admin-report',
  orgChart: 'org-chart',
  approvalInbox: 'approval-inbox',
  leaveBalance: 'leave-balance',
  expenseList: 'expense-list',
  statusBoard: 'status-board',
} as const

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS]
