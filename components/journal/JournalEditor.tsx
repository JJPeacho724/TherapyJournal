'use client'

import { useState, useEffect, useRef } from 'react'

const MAX_CHARS = 5000

interface JournalEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
  autoFocus?: boolean
  guidedPrompt?: string
  onSave?: () => void
  maxLength?: number
}

export function JournalEditor({
  value,
  onChange,
  placeholder = "Write whatever comes to mind...",
  minHeight = '250px',
  autoFocus = false,
  guidedPrompt,
  onSave,
  maxLength = MAX_CHARS,
}: JournalEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [wordCount, setWordCount] = useState(0)
  const charCount = value.length
  const isOverLimit = charCount > maxLength
  const isNearLimit = charCount > maxLength * 0.9

  useEffect(() => {
    const words = value.trim() ? value.trim().split(/\s+/).length : 0
    setWordCount(words)
  }, [value])

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.max(textarea.scrollHeight, parseInt(minHeight))}px`
    }
  }, [value, minHeight])

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      onSave?.()
    }
  }

  return (
    <div className="relative">
      {/* Guided Prompt Banner */}
      {guidedPrompt && (
        <div className="mb-4 text-center">
          <p className="text-sm text-therapy-muted italic">{guidedPrompt}</p>
        </div>
      )}

      {/* Editor */}
      <div className="relative bg-white rounded-2xl border border-sage-200 focus-within:border-sage-300 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full p-5 rounded-2xl resize-none focus:outline-none text-therapy-text placeholder:text-therapy-muted/50 font-serif text-lg leading-relaxed"
          style={{ minHeight }}
        />

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-sage-100">
          <span className="text-xs text-therapy-muted/70">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
          <div className="flex items-center gap-3">
            <span className={`text-xs transition-colors ${
              isOverLimit ? 'text-red-500 font-medium' : isNearLimit ? 'text-amber-500' : 'text-therapy-muted/50'
            }`}>
              {charCount.toLocaleString()}/{maxLength.toLocaleString()}
            </span>
            {onSave && (
              <span className="text-xs text-therapy-muted/50">
                Ctrl+S to save
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
