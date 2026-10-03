'use server'

import { validateCsrf } from '@/lib/csrf'

import { getSavedViews, createSavedView, deleteSavedView } from '@/services/saved-view.service'

export async function listSavedViewsAction(page: string) {
  await validateCsrf()
  return getSavedViews(page)
}

export interface SaveViewState {
  error?: string
}

export async function saveViewAction(
  page: string,
  name: string,
  filters: Record<string, string>
): Promise<SaveViewState> {
  await validateCsrf()
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Give this view a name.' }
  if (trimmed.length > 60) return { error: 'Name is too long.' }

  try {
    await createSavedView(page, trimmed, filters)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save view' }
  }
}

export async function deleteSavedViewAction(id: string): Promise<void> {
  await validateCsrf()
  await deleteSavedView(id)
}
