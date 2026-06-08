export type EmployeeRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT'
export type LeaveType = 'ANNUAL' | 'SICK' | 'HALF_DAY' | 'OTHER'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export type ExpenseCategory = 'TRANSPORT' | 'MEAL' | 'ACCOMMODATION' | 'SUPPLIES' | 'OTHER'
export type OutboxEventType = 'CALENDAR_INSERT' | 'CALENDAR_DELETE' | 'DRIVE_UPLOAD' | 'CHAT_NOTIFY'
export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'

export interface Department {
  id: string
  name: string
  manager_id: string | null
  created_at: string
}

export interface Employee {
  id: string
  auth_user_id: string | null
  department_id: string | null
  name: string
  email: string
  role: EmployeeRole
  phone: string | null
  position: string | null
  google_user_id: string | null
  avatar_url: string | null
  annual_leave_days: number
  remaining_leaves: number
  is_active: boolean
  hired_at: string | null
  created_at: string
  updated_at: string
}

export interface AttendanceRecord {
  id: string
  employee_id: string
  recorded_at: string
  type: AttendanceType
  location: string | null
  latitude: number | null
  longitude: number | null
  is_field: boolean
  note: string | null
  created_at: string
}

export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days_used: number
  reason: string | null
  status: ApprovalStatus
  created_at: string
  updated_at: string
}

export interface LeaveApprovalStep {
  id: string
  leave_request_id: string
  approver_id: string
  step_order: number
  status: ApprovalStatus
  comment: string | null
  acted_at: string | null
  created_at: string
}

export interface ExpenseReport {
  id: string
  employee_id: string
  title: string
  amount: number
  category: ExpenseCategory
  expense_date: string
  receipt_url: string | null
  description: string | null
  status: ApprovalStatus
  created_at: string
  updated_at: string
}

export interface ExpenseApprovalStep {
  id: string
  expense_report_id: string
  approver_id: string
  step_order: number
  status: ApprovalStatus
  comment: string | null
  acted_at: string | null
  created_at: string
}

export interface OutboxEvent {
  id: string
  idempotency_key: string
  event_type: OutboxEventType
  payload: Record<string, unknown>
  status: OutboxStatus
  retry_count: number
  last_error: string | null
  scheduled_at: string
  processed_at: string | null
  created_at: string
}
