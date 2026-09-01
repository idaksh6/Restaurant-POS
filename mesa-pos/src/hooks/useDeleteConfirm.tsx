import { useCallback, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'
import { useI18n } from '../locale/i18n'

export type DeleteConfirmRequest = {
  /** Entity display name — used in the default message */
  name?: string
  /** Override full message */
  message?: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
}

type Pending = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
}

/** Shared delete confirmation dialog for the whole app. */
export function useDeleteConfirm() {
  const { t } = useI18n()
  const [pending, setPending] = useState<Pending | null>(null)

  const askDelete = useCallback(
    (opts: DeleteConfirmRequest) => {
      const name = opts.name?.trim()
      const message =
        opts.message ??
        (name
          ? t.deleteNamedAsk.replace('{name}', name)
          : t.deleteAskGeneric)
      setPending({
        title: opts.title ?? t.confirmDelete,
        message,
        confirmLabel: opts.confirmLabel ?? t.delete,
        cancelLabel: opts.cancelLabel ?? t.keepRecord,
        onConfirm: opts.onConfirm,
      })
    },
    [t],
  )

  const clearDeleteConfirm = useCallback(() => setPending(null), [])

  const deleteConfirmDialog = pending ? (
    <ConfirmModal
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      danger
      onClose={clearDeleteConfirm}
      onConfirm={() => {
        const run = pending.onConfirm
        setPending(null)
        run()
      }}
    />
  ) : null

  return { askDelete, deleteConfirmDialog, clearDeleteConfirm }
}
