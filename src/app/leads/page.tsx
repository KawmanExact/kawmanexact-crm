import { redirect } from 'next/navigation'

/**
 * Leads are no longer a separate record — a deal IS the lead. `/leads` survives
 * only so bookmarks, saved views and emailed links land on the deals list
 * instead of 404ing. Filter params are carried across.
 */
export default function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return searchParams.then((params) => {
    const next = new URLSearchParams()
    next.set('view', 'list')
    for (const key of ['q', 'status', 'sort', 'dir', 'page']) {
      const value = params[key]
      const single = Array.isArray(value) ? value[0] : value
      if (single) next.set(key, single)
    }
    redirect(`/deals?${next.toString()}`)
  })
}