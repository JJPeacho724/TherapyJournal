'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { JournalEditor, MoodSelector, StructuredFields } from '@/components/journal'
import { Button, Card } from '@/components/ui'
import { DisclaimerBanner } from '@/components/shared'

type GuidedStep = 'mood' | 'prompt' | 'write' | 'structured' | 'review'

interface PromptResponse {
  prompt: string
  response: string
}

export default function NewJournalPage() {
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [mode, setMode] = useState<'free' | 'guided'>('guided')
  const [guidedStep, setGuidedStep] = useState<GuidedStep>('mood')
  const [content, setContent] = useState('')
  const [moodScore, setMoodScore] = useState<number | null>(null)
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [currentWriting, setCurrentWriting] = useState('')
  const [promptHistory, setPromptHistory] = useState<PromptResponse[]>([])
  const [structuredFields, setStructuredFields] = useState({
    sleep_hours: null as number | null,
    sleep_quality: null as number | null,
    medication_taken: null as boolean | null,
    medication_notes: null as string | null,
    energy_level: null as number | null,
  })
  const [showStructured, setShowStructured] = useState(false)
  const [shareWithTherapist, setShareWithTherapist] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingPrompt, setLoadingPrompt] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Fetch prompt when entering prompt step
  useEffect(() => {
    if (mode === 'guided' && guidedStep === 'prompt' && !currentPrompt && moodScore) {
      fetchPrompt(promptHistory.length === 0)
    }
  }, [mode, guidedStep, moodScore, currentPrompt, promptHistory.length])

  const fetchPrompt = async (isInitial: boolean) => {
    setLoadingPrompt(true)
    try {
      const response = await fetch('/api/ai/guided-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood_hint: moodScore,
          conversation_history: isInitial ? [] : promptHistory.flatMap(pr => [
            { role: 'ai', content: pr.prompt },
            { role: 'user', content: pr.response }
          ]),
          is_initial: isInitial,
          is_followup: !isInitial
        }),
      })
      const data = await response.json()
      setCurrentPrompt(data.prompt || "What's been on your mind? Take your time.")
    } catch {
      setCurrentPrompt("What's been on your mind? Take your time.")
    } finally {
      setLoadingPrompt(false)
    }
  }

  const handleContinueWriting = () => {
    if (!currentWriting.trim()) return

    const newHistory = [...promptHistory, { prompt: currentPrompt, response: currentWriting }]
    setPromptHistory(newHistory)

    const newContent = content + (content ? '\n\n' : '') + currentWriting
    setContent(newContent)

    setCurrentWriting('')
    setCurrentPrompt('')

    setGuidedStep('prompt')
  }

  const handleFinishWriting = () => {
    if (currentWriting.trim()) {
      const newHistory = [...promptHistory, { prompt: currentPrompt, response: currentWriting }]
      setPromptHistory(newHistory)
      const newContent = content + (content ? '\n\n' : '') + currentWriting
      setContent(newContent)
    }

    setGuidedStep('structured')
  }

  const handleSave = async (isDraft: boolean = false) => {
    if (!content.trim() && !isDraft) return

    setSaving(true)
    try {
      const response = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          is_draft: isDraft,
          shared_with_therapist: shareWithTherapist,
          self_report_mood: moodScore,
          structured_log: (mode === 'guided' || showStructured) ? structuredFields : undefined,
        }),
      })

      if (!response.ok) throw new Error('Failed to save')

      const data = await response.json()

      if (!isDraft && data.entry?.id) {
        fetch('/api/ai/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entry_id: data.entry.id,
            content,
          }),
        }).catch(console.error)
      }

      router.push('/journal')
      router.refresh()
    } catch (error) {
      console.error('Save error:', error)
      alert('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const getProgressSteps = () => {
    const baseSteps = ['mood', 'prompt', 'write']
    for (let i = 0; i < promptHistory.length; i++) {
      baseSteps.push(`followup-${i}`)
    }
    baseSteps.push('structured', 'review')
    return baseSteps
  }

  const getCurrentStepIndex = () => {
    if (guidedStep === 'mood') return 0
    if (guidedStep === 'prompt') return 1 + promptHistory.length
    if (guidedStep === 'write') return 2 + promptHistory.length
    if (guidedStep === 'structured') return getProgressSteps().length - 2
    if (guidedStep === 'review') return getProgressSteps().length - 1
    return 0
  }

  // Guided mode flow
  if (mode === 'guided') {
    const progressSteps = getProgressSteps()
    const currentIndex = getCurrentStepIndex()

    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Mode switcher */}
        <div className="mb-8 text-center">
          <button
            onClick={() => setMode('free')}
            className="text-sm text-therapy-muted hover:text-therapy-text transition-colors"
          >
            Switch to free writing
          </button>
        </div>

        {/* Soft progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {progressSteps.map((_, index) => (
            <div
              key={index}
              className={`h-1 rounded-full transition-all duration-300 ${
                index <= currentIndex
                  ? 'w-8 bg-sage-400'
                  : 'w-2 bg-sage-200'
              }`}
            />
          ))}
        </div>

        {/* Step: Mood */}
        {guidedStep === 'mood' && (
          <div className="animate-fade-in text-center">
            <p className="text-therapy-muted mb-2">Let's start gently</p>
            <h2 className="text-2xl font-normal text-therapy-text mb-8">
              How are you feeling right now?
            </h2>
            <MoodSelector value={moodScore} onChange={setMoodScore} label="" />
            <p className="mt-4 text-xs text-therapy-muted/70">
              Hydrated: {hydrated ? 'yes' : 'no'} · Selected mood: {moodScore ?? '—'}
            </p>
            <div className="mt-10">
              <Button onClick={() => setGuidedStep('prompt')} disabled={!moodScore} size="lg">
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step: Prompt */}
        {guidedStep === 'prompt' && (
          <div className="animate-fade-in text-center">
            <p className="text-sm text-therapy-muted mb-2">
              {promptHistory.length === 0 ? 'Something to get you started' : 'Going a little deeper'}
            </p>
            <h2 className="text-xl font-normal text-therapy-text mb-6">
              {promptHistory.length === 0 ? '' : ''}
            </h2>
            {loadingPrompt ? (
              <div className="py-16">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-sage-300 border-t-sage-500 rounded-full animate-spin" />
                  <p className="text-sm text-therapy-muted">Thinking...</p>
                </div>
              </div>
            ) : (
              <>
                <Card className="bg-sage-50/50 border-sage-100 mb-8">
                  <p className="text-therapy-text font-serif text-lg leading-relaxed py-4">
                    {currentPrompt}
                  </p>
                </Card>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (promptHistory.length === 0) {
                        setGuidedStep('mood')
                        setCurrentPrompt('')
                      } else {
                        const lastEntry = promptHistory[promptHistory.length - 1]
                        setCurrentWriting(lastEntry.response)
                        setCurrentPrompt(lastEntry.prompt)
                        setPromptHistory(promptHistory.slice(0, -1))
                        const parts = content.split('\n\n')
                        parts.pop()
                        setContent(parts.join('\n\n'))
                        setGuidedStep('write')
                      }
                    }}
                  >
                    Back
                  </Button>
                  <Button onClick={() => setGuidedStep('write')}>
                    Begin writing
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: Write */}
        {guidedStep === 'write' && (
          <div className="animate-fade-in">
            {/* Soft prompt reminder */}
            <div className="mb-6 text-center">
              <p className="text-sm text-therapy-muted italic font-serif">{currentPrompt}</p>
            </div>

            {/* Previous responses */}
            {promptHistory.length > 0 && (
              <div className="mb-4">
                <details className="group">
                  <summary className="cursor-pointer text-sm text-therapy-muted hover:text-therapy-text">
                    What you've written so far
                  </summary>
                  <div className="mt-3 space-y-3 text-sm text-therapy-text/70 bg-white/50 rounded-xl p-4">
                    {promptHistory.map((pr, idx) => (
                      <p key={idx} className="font-serif">{pr.response}</p>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* Editor */}
            <JournalEditor
              value={currentWriting}
              onChange={setCurrentWriting}
              autoFocus
              placeholder="Write whatever comes to mind..."
              minHeight="200px"
            />

            {/* Actions */}
            <div className="mt-8 flex flex-col gap-3">
              <div className="flex gap-3 justify-center">
                <Button
                  variant="ghost"
                  onClick={handleFinishWriting}
                  disabled={!currentWriting.trim() && promptHistory.length === 0}
                >
                  I'm done writing
                </Button>
                <Button
                  onClick={handleContinueWriting}
                  disabled={!currentWriting.trim()}
                >
                  Continue with another prompt
                </Button>
              </div>
              <button
                onClick={() => setGuidedStep('prompt')}
                className="text-sm text-therapy-muted hover:text-therapy-text text-center"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {/* Step: Structured */}
        {guidedStep === 'structured' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <p className="text-sm text-therapy-muted mb-2">Almost there</p>
              <h2 className="text-xl font-normal text-therapy-text">
                A few more things (all optional)
              </h2>
              <p className="text-sm text-therapy-muted mt-2">
                These help us notice patterns over time
              </p>
            </div>
            <StructuredFields values={structuredFields} onChange={setStructuredFields} />
            <div className="mt-8 flex gap-3 justify-center">
              <Button variant="ghost" onClick={() => setGuidedStep('write')}>
                Back
              </Button>
              <Button onClick={() => setGuidedStep('review')}>
                Review
              </Button>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {guidedStep === 'review' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-xl font-normal text-therapy-text">
                Here's what you wrote
              </h2>
            </div>

            <Card className="mb-6 bg-white/80">
              <p className="font-serif text-therapy-text leading-relaxed whitespace-pre-wrap">
                {content}
              </p>
            </Card>

            {/* Share toggle */}
            <div className="flex items-center justify-between p-4 bg-sage-50 rounded-xl mb-6">
              <div>
                <p className="text-sm font-medium text-therapy-text">Share with your therapist</p>
                <p className="text-xs text-therapy-muted">They'll be able to read this entry</p>
              </div>
              <button
                onClick={() => setShareWithTherapist(!shareWithTherapist)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  shareWithTherapist ? 'bg-sage-500' : 'bg-gray-300'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  shareWithTherapist ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="ghost" onClick={() => setGuidedStep('structured')}>
                Back
              </Button>
              <Button variant="secondary" onClick={() => handleSave(true)} loading={saving}>
                Save as draft
              </Button>
              <Button onClick={() => handleSave(false)} loading={saving}>
                Save entry
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Free writing mode
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-therapy-muted mb-2">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}
        </p>
        <h1 className="text-2xl font-normal text-therapy-text">
          What's on your mind?
        </h1>
        <button
          onClick={() => { setMode('guided'); setGuidedStep('mood'); }}
          className="mt-2 text-sm text-sage-600 hover:underline"
        >
          Try guided writing instead
        </button>
      </div>

      {/* Mood selector */}
      <div className="mb-8">
        <MoodSelector value={moodScore} onChange={setMoodScore} label="How are you feeling?" />
      </div>

      {/* Editor */}
      <JournalEditor
        value={content}
        onChange={setContent}
        autoFocus
        onSave={() => handleSave(false)}
        placeholder="Write whatever comes to mind..."
      />

      {/* Optional structured fields */}
      <div className="mt-6">
        <button
          onClick={() => setShowStructured(!showStructured)}
          className="text-sm text-therapy-muted hover:text-therapy-text"
        >
          {showStructured ? 'Hide' : 'Add'} sleep & energy details
        </button>

        {showStructured && (
          <div className="mt-4 animate-fade-in">
            <StructuredFields values={structuredFields} onChange={setStructuredFields} />
          </div>
        )}
      </div>

      {/* Share toggle */}
      <div className="mt-6 flex items-center justify-between p-4 bg-sage-50 rounded-xl">
        <div>
          <p className="text-sm font-medium text-therapy-text">Share with your therapist</p>
          <p className="text-xs text-therapy-muted">They'll be able to read this entry</p>
        </div>
        <button
          onClick={() => setShareWithTherapist(!shareWithTherapist)}
          className={`w-12 h-6 rounded-full transition-colors ${
            shareWithTherapist ? 'bg-sage-500' : 'bg-gray-300'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
            shareWithTherapist ? 'translate-x-6' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {/* Actions */}
      <div className="mt-8 flex gap-3 justify-center">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={() => handleSave(true)} loading={saving}>
          Save as draft
        </Button>
        <Button onClick={() => handleSave(false)} loading={saving} disabled={!content.trim()}>
          Save entry
        </Button>
      </div>

      <DisclaimerBanner className="mt-8" />
    </div>
  )
}
