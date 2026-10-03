
'use client'

import { useActionState, useState, useTransition } from 'react'
import { Plug, Plus, Trash2, X, ExternalLink, RotateCcw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { IntegrationItem } from '@/services/integration.service'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { createIntegrationAction, toggleIntegrationAction, deleteIntegrationAction, type IntegrationFormState } from './actions'

type IntegrationType = { type: string; label: string; description: string }

const initialState: IntegrationFormState = {}

export function IntegrationsView({
  integrations,
  types,
}: {
  integrations: IntegrationItem[]
  types: readonly IntegrationType[]
}) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add integration
        </Button>
      </div>

      {showForm && <NewIntegrationForm types={types} onDone={() => setShowForm(false)} />}

      <Card className="bg-[#0a111c]/80 border-white/[0.08] divide-y divide-white/[0.05]">
        {integrations.length === 0 && (
          <div className="p-8 text-center">
            <Plug className="h-6 w-6 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/40">No integrations configured yet.</p>
          </div>
        )}
        {integrations.map((i) => (
          <IntegrationRow key={i.id} integration={i} />
        ))}
      </Card>
    </div>
  )
}

function IntegrationRow({ integration }: { integration: IntegrationItem }) {
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showDeliveries, setShowDeliveries] = useState(false)
  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [deliveriesOffset, setDeliveriesOffset] = useState(0)
  const [deliveriesHasMore, setDeliveriesHasMore] = useState(true)
  const [testPending, setTestPending] = useState(false)

  const isWebhook = integration.type === 'webhook'

  async function loadDeliveries(append = false) {
    if (deliveriesLoading) return
    setDeliveriesLoading(true)
    try {
      const res = await fetch('/api/admin/integrations/' + integration.id + '/deliveries?limit=20&offset=' + (append ? deliveriesOffset : 0))
      if (res.ok) {
        const data = await res.json()
        if (append) {
          setDeliveries((prev) => [...prev, ...data.deliveries])
        } else {
          setDeliveries(data.deliveries)
        }
        setDeliveriesOffset(data.deliveries.length)
        setDeliveriesHasMore(data.hasMore)
      }
    } catch (error) {
      console.error('Failed to load deliveries:', error)
    } finally {
      setDeliveriesLoading(false)
    }
  }

  async function handleTest() {
    if (testPending) return
    setTestPending(true)
    try {
      const res = await fetch('/api/admin/integrations/' + integration.id + '/test', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        alert('Test webhook queued successfully!')
        setShowDeliveries(true)
        setDeliveriesOffset(0)
        await loadDeliveries(false)
      } else {
        alert('Failed to queue test: ' + data.message)
      }
    } catch {
      alert('Failed to test webhook')
    } finally {
      setTestPending(false)
    }
  }

  async function handleRetry(deliveryId: string) {
    try {
      const res = await fetch('/api/admin/integrations/' + integration.id + '/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId }),
      })
      const data = await res.json()
      if (data.success) {
        alert('Retry queued successfully!')
        await loadDeliveries(false)
      } else {
        alert('Failed to queue retry: ' + data.message)
      }
    } catch {
      alert('Failed to retry webhook')
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 p-4">
        <div className="h-9 w-9 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
          <Plug className="h-4 w-4 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{integration.name}</p>
            <Badge variant={integration.isActive ? 'success' : 'neutral'}>
              {integration.isActive ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <p className="text-xs text-white/40 truncate">
            {integration.type} · {integration.configSummary} · added {formatDate(integration.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isWebhook && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTest}
              disabled={testPending}
              className="gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Test
            </Button>
          )}
          {isWebhook && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowDeliveries(!showDeliveries)
                if (!showDeliveries) {
                  setDeliveriesOffset(0)
                  loadDeliveries(false)
                }
              }}
              className="gap-1.5"
            >
              {showDeliveries ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              History
            </Button>
          )}
          <button
            onClick={() => startTransition(() => toggleIntegrationAction(integration.id, !integration.isActive))}
            disabled={pending}
            className="text-xs px-2.5 py-1 rounded-full border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
          >
            {integration.isActive ? 'Pause' : 'Activate'}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 transition-colors"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={"Remove \"" + integration.name + "\"?"}
          description="This will disconnect the integration."
          confirmLabel="Remove"
          variant="destructive"
          loading={pending}
          onConfirm={() => startTransition(() => deleteIntegrationAction(integration.id))}
        />
      </div>

      {showDeliveries && isWebhook && (
        <div className="border-t border-white/[0.05] bg-white/[0.02] p-4">
          <div className="space-y-2">
            {deliveries.length === 0 && !deliveriesLoading && (
              <p className="text-sm text-white/40 text-center py-4">No deliveries yet.</p>
            )}
            {deliveries.map((d) => (
              <div
                key={d.id}
                className={"flex items-center gap-3 p-3 rounded-lg " + (d.success ? 'bg-emerald-500/10' : 'bg-red-500/10') + " border " + (d.success ? 'border-emerald-500/20' : 'border-red-500/20')}
              >
                <div className={"h-2 w-2 rounded-full " + (d.success ? 'bg-emerald-400' : 'bg-red-400') + " shrink-0"} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{d.event}</p>
                  <p className="text-xs text-white/50 truncate">{d.url}</p>
                  <p className="text-xs text-white/40">
                    {formatDate(d.deliveredAt)} · Attempt {d.attempt} · {d.responseStatus ? 'HTTP ' + d.responseStatus : d.error || 'No response'}
                  </p>
                </div>
                {!d.success && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRetry(d.id)}
                    className="gap-1.5 text-red-400 hover:bg-red-500/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
              </div>
            ))}
            {deliveriesHasMore && (
              <div className="text-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadDeliveries(true)}
                  disabled={deliveriesLoading}
                  className="w-full"
                >
                  {deliveriesLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading...
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

interface WebhookDeliveryItem {
  id: string
  event: string
  url: string
  success: boolean
  responseStatus: number | null
  error: string | null
  attempt: number
  deliveredAt: string
}

function NewIntegrationForm({ types, onDone }: { types: readonly IntegrationType[]; onDone: () => void }) {
  const [type, setType] = useState<string>(types[0]?.type ?? 'webhook')
  const [state, formAction, pending] = useActionState(createIntegrationAction, initialState)
  const selected = types.find((t) => t.type === type)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm text-white/70">Name *</label>
          <input
            name="name"
            required
            placeholder="e.g. Ops Slack channel"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          {state.fieldErrors?.name && <p className="text-xs text-red-400">{state.fieldErrors.name}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-white/70">Type</label>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {types.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">
            {type === 'slack' ? 'Slack channel' : type === 'email' ? 'Forward to email' : 'Webhook / feed URL'} *
          </label>
          <input
            name="value"
            required
            placeholder={type === 'slack' ? 'sales-alerts' : type === 'email' ? 'ops@company.com' : 'https://…'}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          {state.fieldErrors?.value && <p className="text-xs text-red-400">{state.fieldErrors.value}</p>}
          {selected && <p className="text-xs text-white/30">{selected.description}</p>}
        </div>

        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending} loading={pending}>
            {pending ? 'Adding…' : 'Add integration'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
