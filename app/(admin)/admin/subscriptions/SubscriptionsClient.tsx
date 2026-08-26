'use client'

import { useState } from 'react'
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from './actions'
import type { SubscriptionFormData } from './actions'

type Subscription = {
  id: string
  name: string
  cost: number
  billing_cycle: 'MONTHLY' | 'YEARLY'
  renewal_date: string
  manager_id: string | null
  manager: { id: string; name: string } | null
  payment_method: 'CARD' | 'TRANSFER' | 'OTHER'
  card_name: string | null
  card_last4: string | null
  license_count: number | null
  department_id: string | null
  department: { id: string; name: string } | null
  notes: string | null
}

type Employee = { id: string; name: string }
type Department = { id: string; name: string }

const EMPTY_FORM: SubscriptionFormData = {
  name: '',
  cost: 0,
  billing_cycle: 'MONTHLY',
  renewal_date: '',
  manager_id: null,
  payment_method: 'CARD',
  card_name: null,
  card_last4: null,
  license_count: null,
  department_id: null,
  notes: null,
}

export default function SubscriptionsClient({
  subscriptions,
  employees,
  departments,
}: {
  subscriptions: Subscription[]
  employees: Employee[]
  departments: Department[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Subscription | null>(null)
  const [form, setForm] = useState<SubscriptionFormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setError(null)
    setIsModalOpen(true)
  }

  function openEdit(sub: Subscription) {
    setEditTarget(sub)
    setForm({
      name: sub.name,
      cost: sub.cost,
      billing_cycle: sub.billing_cycle,
      renewal_date: sub.renewal_date,
      manager_id: sub.manager_id,
      payment_method: sub.payment_method,
      card_name: sub.card_name,
      card_last4: sub.card_last4,
      license_count: sub.license_count,
      department_id: sub.department_id,
      notes: sub.notes,
    })
    setError(null)
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = editTarget
      ? await updateSubscription(editTarget.id, form)
      : await createSubscription(form)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setIsModalOpen(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 구독을 삭제하시겠습니까?`)) return
    const result = await deleteSubscription(id)
    if (result.error) alert(result.error)
  }

  function formatCost(cost: number) {
    return `₩${cost.toLocaleString()}`
  }

  function formatPayment(sub: Subscription) {
    if (sub.payment_method === 'CARD') {
      const parts = [
        sub.card_name,
        sub.card_last4 ? `****${sub.card_last4}` : null,
      ].filter(Boolean)
      return parts.length > 0 ? parts.join(' ') : '카드'
    }
    if (sub.payment_method === 'TRANSFER') return '계좌이체'
    return '기타'
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90"
        >
          추가
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['서비스명', '비용', '결제주기', '갱신일', '담당자', '라이선스', '부서', '결제수단', ''].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {subscriptions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  등록된 구독서비스가 없습니다.
                </td>
              </tr>
            ) : (
              subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{sub.name}</td>
                  <td className="px-4 py-3 text-gray-700">{formatCost(sub.cost)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {sub.billing_cycle === 'MONTHLY' ? '월간' : '연간'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{sub.renewal_date}</td>
                  <td className="px-4 py-3 text-gray-700">{sub.manager?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{sub.license_count ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{sub.department?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatPayment(sub)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(sub)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(sub.id, sub.name)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">
                {editTarget ? '구독서비스 수정' : '구독서비스 추가'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">서비스명 *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비용 (원) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.cost || ''}
                  onChange={(e) => setForm((f) => ({ ...f, cost: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">결제주기 *</label>
                <select
                  value={form.billing_cycle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, billing_cycle: e.target.value as 'MONTHLY' | 'YEARLY' }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="MONTHLY">월간</option>
                  <option value="YEARLY">연간</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">갱신일 *</label>
                <input
                  type="date"
                  required
                  value={form.renewal_date}
                  onChange={(e) => setForm((f) => ({ ...f, renewal_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">담당자 *</label>
                <select
                  required
                  value={form.manager_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value || null }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">선택</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">결제수단 *</label>
                <select
                  value={form.payment_method}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      payment_method: e.target.value as 'CARD' | 'TRANSFER' | 'OTHER',
                      card_name: null,
                      card_last4: null,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="CARD">카드</option>
                  <option value="TRANSFER">계좌이체</option>
                  <option value="OTHER">기타</option>
                </select>
              </div>

              {form.payment_method === 'CARD' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">카드명</label>
                    <input
                      type="text"
                      placeholder="신한, 국민 등"
                      value={form.card_name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, card_name: e.target.value || null }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-sm font-medium text-gray-700 mb-1">끝 4자리</label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="1234"
                      value={form.card_last4 ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          card_last4: e.target.value.replace(/\D/g, '').slice(0, 4) || null,
                        }))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">라이선스 수량</label>
                <input
                  type="number"
                  min={1}
                  value={form.license_count ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      license_count: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사용 부서</label>
                <select
                  value={form.department_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value || null }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">전사</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <textarea
                  rows={2}
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? '저장 중...' : editTarget ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
