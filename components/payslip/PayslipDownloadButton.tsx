'use client'

import { useState } from 'react'

interface Props {
  url: string
  fileName: string
  className?: string
}

export default function PayslipDownloadButton({ url, fileName, className }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(href)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className={className}
    >
      {loading ? '...' : '다운로드'}
    </button>
  )
}
