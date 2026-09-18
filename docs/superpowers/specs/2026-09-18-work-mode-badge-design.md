# Work Mode Badge — 관리자 근태 일별 뷰 근무 위치 배지

**Date:** 2026-09-18  
**Status:** Approved  
**Scope:** `components/admin/AttendanceSummaryView.tsx` 단일 파일 수정

---

## 목표

관리자가 근태 현황 일별 뷰에서 직원별 출근 유형(사무실/재택/외근)과 현재 외근 상태(외근중)를 한눈에 파악할 수 있도록 인라인 배지를 추가한다.

---

## 데이터 소스

`rawRecords` prop은 이미 `AttendanceSummaryView`에 전달되며, `is_field`와 `note` 필드를 포함한다. 추가 DB 쿼리 없음.

```
attendance_records
  type          -- CHECK_IN | CHECK_OUT | BREAK_START | BREAK_END | FIELD_START | FIELD_END
  is_field      -- boolean
  note          -- '재택' | '재택 변경 신청 (...)' | '외근 - ...' | null 등
  recorded_at   -- UTC ISO string
  employee_id   -- UUID
```

---

## 배지 결정 로직

직원 + 날짜 기준으로 `rawRecords`를 필터링해 두 가지를 판단한다.

### 1. 출근 유형 (checkInType)

`CHECK_IN` 레코드의 `is_field` + `note` 조합:

| 조건 | checkInType |
|---|---|
| CHECK_IN 없음 | `null` — 배지 미표시 |
| `is_field=true` | `'field'` |
| `note` starts with `'재택'` | `'remote'` |
| 그 외 (`is_field=false`, `note=null`) | `'office'` |

### 2. 현재 외근 상태 (isCurrentlyField)

정렬된 당일 레코드 중 **마지막 레코드**의 type이 `FIELD_START`이면 `true`. `CHECK_OUT` 이후에는 배지를 표시하지 않는다(이미 퇴근).

---

## 배지 UI

일별 뷰 테이블의 **직원 이름 셀** 내부에 이름 아래 줄에 인라인 배지 렌더링.

| 배지 텍스트 | 스타일 | 표시 조건 |
|---|---|---|
| `사무실` | `bg-blue-50 text-blue-600` | checkInType = 'office' |
| `재택` | `bg-purple-50 text-purple-600` | checkInType = 'remote' |
| `외근` | `bg-orange-50 text-orange-600` | checkInType = 'field' |
| `외근중` | `bg-yellow-50 text-yellow-700` | isCurrentlyField = true |

- 출근 유형 배지와 외근중 배지는 **동시에 표시** 가능 (예: `재택` + `외근중`)
- `사무실` / `재택` / `외근` 배지는 퇴근 후에도 표시 — 당일 어디서 근무했는지 기록 확인 목적
- `외근중` 배지는 마지막 레코드가 `FIELD_START`일 때만 표시되므로, CHECK_OUT 이후에는 자동으로 사라짐

---

## 구현 범위

- `AttendanceSummaryView.tsx`: `getWorkMode` 헬퍼 함수 추가 + 일별 뷰 직원 이름 셀에 배지 렌더링
- 주별/월별 뷰: 변경 없음
- DB/API/타입 변경: 없음

---

## 엣지 케이스

- CHECK_IN 없이 FIELD_START만 있는 경우 → `checkInType=null`, `isCurrentlyField=true` → `외근중` 배지만 표시
- 외근 직접 출근(`is_field=true` CHECK_IN) 후 FIELD_START 존재 → `외근` + `외근중` 둘 다 표시
- 휴가자(CHECK_IN 없음) → 배지 없음, 기존 휴가 배지만 유지
