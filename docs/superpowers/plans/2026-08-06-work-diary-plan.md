# Work Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-employee daily markdown diary with admin/team-lead read-only view.

**Architecture:** Server pages fetch data → pass to `'use client'` components → server actions mutate. UPSERT pattern for diary save. RLS restricts row access by role/department.

**Tech Stack:** Next.js App Router, Supabase RLS + UPSERT, `marked` (markdown→HTML)

---

### Task 1: Migration 075 — work_diaries table + RLS + trigger
- [ ] Run SQL in Supabase SQL Editor (see implementation)
- [ ] Verify table created with UNIQUE constraint

### Task 2: Server actions — upsertDiary, deleteDiary
- [ ] Create `app/(dashboard)/diary/actions.ts`

### Task 3: DiaryListClient + list page
- [ ] Create `components/diary/DiaryListClient.tsx`
- [ ] Create `app/(dashboard)/diary/page.tsx`

### Task 4: DiaryEditorClient + editor page
- [ ] Create `components/diary/DiaryEditorClient.tsx`
- [ ] Create `app/(dashboard)/diary/[date]/page.tsx`

### Task 5: DiaryViewerClient + admin page
- [ ] Create `components/diary/DiaryViewerClient.tsx`
- [ ] Create `app/(admin)/admin/diary/page.tsx`

### Task 6: Sidebar + layout changes
- [ ] Update `app/(dashboard)/layout.tsx` — add hasTeamMembers query
- [ ] Update `components/layout/Sidebar.tsx` — add diary links
