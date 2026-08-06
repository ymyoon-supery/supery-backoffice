'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Save, Trash2, ArrowLeft, Bold, Italic, Strikethrough, List, ListOrdered, Minus } from 'lucide-react'
import { upsertDiary, deleteDiary } from '@/app/(dashboard)/diary/actions'
import { toast } from 'sonner'

type DiaryData = { content: string; created_at: string; updated_at: string } | null

function ToolbarBtn({
  onClick, active, title, children,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2 py-1 rounded text-sm transition-colors ${
        active ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

export default function DiaryEditorClient({ date, initialDiary }: { date: string; initialDiary: DiaryData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const dateLabel = format(parseISO(date), 'yyyy년 M월 d일 (EEEE)', { locale: ko })
  const isModified = initialDiary && initialDiary.updated_at > initialDiary.created_at

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialDiary?.content ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[420px] p-4 focus:outline-none',
      },
    },
  })

  function handleSave() {
    if (!editor || editor.isEmpty) { toast.error('내용을 입력해주세요.'); return }
    const html = editor.getHTML()
    startTransition(async () => {
      const { error } = await upsertDiary(date, html)
      if (error) { toast.error(error); return }
      toast.success('저장되었습니다.')
      router.refresh()
    })
  }

  function handleDelete() {
    if (!confirm('이 날의 다이어리를 삭제하시겠습니까?')) return
    startTransition(async () => {
      const { error } = await deleteDiary(date)
      if (error) { toast.error(error); return }
      toast.success('삭제되었습니다.')
      router.push('/diary')
    })
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <button onClick={() => router.push('/diary')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-1">
            <ArrowLeft size={12} />목록으로
          </button>
          <h1 className="text-xl font-bold text-gray-900">{dateLabel}</h1>
          {initialDiary && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              최초 작성: {format(parseISO(initialDiary.created_at), 'yyyy-MM-dd HH:mm')}
              {isModified && <> · 최종 수정: {format(parseISO(initialDiary.updated_at), 'yyyy-MM-dd HH:mm')}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {initialDiary && (
            <button onClick={handleDelete} disabled={isPending}
              className="flex items-center gap-1.5 text-sm text-red-600 border border-red-200 px-3 py-1.5 rounded-md hover:bg-red-50 disabled:opacity-50">
              <Trash2 size={14} />삭제
            </button>
          )}
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-1.5 text-sm bg-primary text-white px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-50">
            <Save size={14} />{isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* 서식 툴바 */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 flex-wrap">
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor?.isActive('heading', { level: 1 })}
            title="제목 1 (큰 글씨)"
          >
            <span className="font-bold text-xs">H1</span>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive('heading', { level: 2 })}
            title="제목 2 (중간 글씨)"
          >
            <span className="font-bold text-xs">H2</span>
          </ToolbarBtn>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive('bold')}
            title="굵게"
          >
            <Bold size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive('italic')}
            title="기울임"
          >
            <Italic size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            active={editor?.isActive('strike')}
            title="취소선"
          >
            <Strikethrough size={14} />
          </ToolbarBtn>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive('bulletList')}
            title="글머리 목록"
          >
            <List size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive('orderedList')}
            title="번호 목록"
          >
            <ListOrdered size={14} />
          </ToolbarBtn>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <ToolbarBtn
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
            title="구분선"
          >
            <Minus size={14} />
          </ToolbarBtn>
        </div>

        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
