'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ConfirmModal } from '@/components/ui'

interface EntryActionsProps {
  entryId: string
  isShared: boolean
}

export function EntryActions({ entryId, isShared }: EntryActionsProps) {
  const router = useRouter()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [currentShared, setCurrentShared] = useState(isShared)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/journal/${entryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete')

      router.push('/journal')
      router.refresh()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete entry. Please try again.')
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const toggleShare = async () => {
    setSharing(true)
    try {
      const response = await fetch(`/api/journal/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shared_with_therapist: !currentShared }),
      })

      if (!response.ok) throw new Error('Failed to update')

      setCurrentShared(!currentShared)
      router.refresh()
    } catch (error) {
      console.error('Share toggle error:', error)
      alert('Failed to update sharing. Please try again.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleShare}
          disabled={sharing}
          title={currentShared ? 'Stop sharing with therapist' : 'Share with therapist'}
        >
          <svg className={`w-4 h-4 ${currentShared ? 'text-calm-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDeleteModal(true)}
          title="Delete entry"
        >
          <svg className="w-4 h-4 text-therapy-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </Button>
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Entry"
        message="Are you sure you want to delete this journal entry? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />
    </>
  )
}

