import pathlib, re

def patch(path: str, old: str, new: str):
    p = pathlib.Path(path)
    t = p.read_text(encoding="utf-8")
    if old not in t:
        print(f"MISS {path}")
        print(repr(t[:2000]))
        return False
    t = t.replace(old, new)
    p.write_text(t, encoding="utf-8")
    print(f"patched {path}")
    return True

# --- 1. leads/new/lead-form.tsx ---
p = pathlib.Path("src/app/leads/new/lead-form.tsx")
t = p.read_text(encoding="utf-8")
# Add imports
t = t.replace(
    "import { useActionState } from 'react'",
    "import { useActionState, useEffect } from 'react'"
)
t = t.replace(
    "import { createLeadAction, type LeadFormState } from '../actions'",
    "import { useRouter } from 'next/navigation'\nimport { toast } from 'sonner'\nimport { createLeadAction, type LeadFormState } from '../actions'"
)
# Add router + effect after useActionState line
t = t.replace(
    "  const [state, formAction, pending] = useActionState(createLeadAction, initialState)",
    "  const [state, formAction, pending] = useActionState(createLeadAction, initialState)\n  const router = useRouter()\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success && state.createdId) {\n      toast.success('Lead created')\n      router.push(`/leads/${state.createdId}`)\n    }\n  }, [state.error, state.success, state.createdId, router])"
)
p.write_text(t, encoding="utf-8")
print("patched leads/new/lead-form")

# --- 2. companies/new/company-form.tsx ---
p = pathlib.Path("src/app/companies/new/company-form.tsx")
t = p.read_text(encoding="utf-8")
t = t.replace("import { useActionState } from 'react'", "import { useActionState, useEffect } from 'react'")
t = t.replace(
    "import { createCompanyAction, type CompanyFormState } from '../actions'",
    "import { useRouter } from 'next/navigation'\nimport { toast } from 'sonner'\nimport { createCompanyAction, type CompanyFormState } from '../actions'"
)
t = t.replace(
    "  const [state, formAction, pending] = useActionState(createCompanyAction, initialState)",
    "  const [state, formAction, pending] = useActionState(createCompanyAction, initialState)\n  const router = useRouter()\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success && state.createdId) {\n      toast.success('Company created')\n      router.push(`/companies/${state.createdId}`)\n    }\n  }, [state.error, state.success, state.createdId, router])"
)
p.write_text(t, encoding="utf-8")
print("patched companies/new/company-form")

# --- 3. contacts/new/contact-form.tsx ---
p = pathlib.Path("src/app/contacts/new/contact-form.tsx")
t = p.read_text(encoding="utf-8")
t = t.replace("import { useActionState } from 'react'", "import { useActionState, useEffect } from 'react'")
t = t.replace(
    "import { createContactAction, type ContactFormState } from '../actions'",
    "import { useRouter } from 'next/navigation'\nimport { toast } from 'sonner'\nimport { createContactAction, type ContactFormState } from '../actions'"
)
t = t.replace(
    "  const [state, formAction, pending] = useActionState(createContactAction, initialState)",
    "  const [state, formAction, pending] = useActionState(createContactAction, initialState)\n  const router = useRouter()\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success && state.createdId) {\n      toast.success('Contact created')\n      router.push(`/contacts/${state.createdId}`)\n    }\n  }, [state.error, state.success, state.createdId, router])"
)
p.write_text(t, encoding="utf-8")
print("patched contacts/new/contact-form")

# --- 4. deals/new/deal-form.tsx ---
p = pathlib.Path("src/app/deals/new/deal-form.tsx")
t = p.read_text(encoding="utf-8")
t = t.replace("import { useActionState } from 'react'", "import { useActionState, useEffect } from 'react'")
t = t.replace(
    "import { createDealAction, type DealFormState } from '../actions'",
    "import { useRouter } from 'next/navigation'\nimport { toast } from 'sonner'\nimport { createDealAction, type DealFormState } from '../actions'"
)
t = t.replace(
    "  const [state, formAction, pending] = useActionState(createDealAction, initialState)",
    "  const [state, formAction, pending] = useActionState(createDealAction, initialState)\n  const router = useRouter()\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success && state.createdId) {\n      toast.success('Deal created')\n      router.push(`/deals/${state.createdId}`)\n    }\n  }, [state.error, state.success, state.createdId, router])"
)
p.write_text(t, encoding="utf-8")
print("patched deals/new/deal-form")

# --- 5. leads/[id]/lead-detail-form.tsx ---
p = pathlib.Path("src/app/leads/[id]/lead-detail-form.tsx")
t = p.read_text(encoding="utf-8")
# Already has useActionState, useState, useTransition
if "useEffect" not in t:
    t = t.replace("import { useActionState, useState, useTransition } from 'react'", "import { useActionState, useEffect, useState, useTransition } from 'react'")
if "from 'sonner'" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { toast } from 'sonner'\nimport { Card } from '@/components/ui/card'")
# Add effect after useActionState line for update
t = t.replace(
    "  const [state, formAction, pending] = useActionState(boundUpdate, initialState)",
    "  const [state, formAction, pending] = useActionState(boundUpdate, initialState)\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success) toast.success('Lead updated')\n  }, [state.error, state.success])"
)
# Recalculate toast
t = t.replace(
    "      if (result.error) setScoreError(result.error)\n      else if (typeof result.score === 'number') setLiveScore(result.score)",
    "      if (result.error) { setScoreError(result.error); toast.error(result.error) }\n      else if (typeof result.score === 'number') { setLiveScore(result.score); toast.success('Score recalculated') }"
)
# Delete + convert are form actions currently — patch to use toast + router push via transition
# We will replace the two <form action=...> blocks with buttons using transitions
# Add router import if missing
if "useRouter" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { useRouter } from 'next/navigation'\nimport { Card } from '@/components/ui/card'")
# Ensure we have router const
if "const router = useRouter()" not in t:
    t = t.replace("  const [liveScore, setLiveScore] = useState(lead.score)", "  const router = useRouter()\n  const [liveScore, setLiveScore] = useState(lead.score)")
# Patch delete/convert section - add confirm dialog + toast handlers
# Original block:
old_block = """      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
        <span className="text-xs text-white/40">Current value: {formatCurrency(lead.value)}</span>
        <div className="flex gap-2">
          <form action={convertLeadToDealAction.bind(null, lead.id)}>
            <Button type="submit" variant="secondary" size="sm">
              Convert to deal
            </Button>
          </form>
          <form action={deleteLeadAction.bind(null, lead.id)}>
            <Button type="submit" variant="destructive" size="sm">
              Delete lead
            </Button>
          </form>
        </div>
      </div>"""
new_block = """      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
        <span className="text-xs text-white/40">Current value: {formatCurrency(lead.value)}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              startScoreTransition(async () => {
                try {
                  await convertLeadToDealAction(lead.id)
                  toast.success('Lead converted to deal')
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed to convert')
                }
              })
            }}
            disabled={scorePending}
          >
            Convert to deal
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              startScoreTransition(async () => {
                const res = await deleteLeadAction(lead.id)
                if (res?.error) toast.error(res.error)
                else if (res?.success) {
                  toast.success('Lead deleted')
                  router.push('/leads')
                }
              })
            }}
            disabled={scorePending}
          >
            Delete lead
          </Button>
        </div>
      </div>"""
if old_block in t:
    t = t.replace(old_block, new_block)
    print("patched lead detail convert/delete")
else:
    print("MISS lead detail block")
    # debug
    print(repr(t[t.find("Current value"):t.find("Current value")+800]))

p.write_text(t, encoding="utf-8")
print("patched leads/[id]/lead-detail-form")

# --- 6. companies/[id]/company-detail-form.tsx ---
p = pathlib.Path("src/app/companies/[id]/company-detail-form.tsx")
t = p.read_text(encoding="utf-8")
if "from 'sonner'" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { toast } from 'sonner'\nimport { Card } from '@/components/ui/card'")
if "useEffect" not in t:
    t = t.replace("import { useActionState, useState, useTransition } from 'react'", "import { useActionState, useEffect, useState, useTransition } from 'react'")
t = t.replace(
    "  const [state, formAction, pending] = useActionState(boundUpdate, initialState)",
    "  const [state, formAction, pending] = useActionState(boundUpdate, initialState)\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success) toast.success('Company updated')\n  }, [state.error, state.success])"
)
# handleDelete toast
t = t.replace(
    "  function handleDelete() {\n    startDelete(async () => {\n      await deleteCompanyAction(company.id)\n      router.push('/companies')\n    })\n  }",
    "  function handleDelete() {\n    startDelete(async () => {\n      const res = await deleteCompanyAction(company.id)\n      if (res?.error) toast.error(res.error)\n      else if (res?.success) {\n        toast.success('Company deleted')\n        router.push('/companies')\n      }\n    })\n  }"
)
p.write_text(t, encoding="utf-8")
print("patched companies/[id]/company-detail-form")

# --- 7. contacts/[id]/contact-detail-form.tsx ---
p = pathlib.Path("src/app/contacts/[id]/contact-detail-form.tsx")
t = p.read_text(encoding="utf-8")
if "from 'sonner'" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { toast } from 'sonner'\nimport { Card } from '@/components/ui/card'")
if "useEffect" not in t:
    t = t.replace("import { useActionState, useState, useTransition } from 'react'", "import { useActionState, useEffect, useState, useTransition } from 'react'")
t = t.replace(
    "  const [state, formAction, pending] = useActionState(boundUpdate, initialState)",
    "  const [state, formAction, pending] = useActionState(boundUpdate, initialState)\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success) toast.success('Contact updated')\n  }, [state.error, state.success])"
)
t = t.replace(
    "  function handleDelete() {\n    startDelete(async () => {\n      await deleteContactAction(contact.id)\n      router.push('/contacts')\n    })\n  }",
    "  function handleDelete() {\n    startDelete(async () => {\n      const res = await deleteContactAction(contact.id)\n      if (res?.error) toast.error(res.error)\n      else if (res?.success) {\n        toast.success('Contact deleted')\n        router.push('/contacts')\n      }\n    })\n  }"
)
p.write_text(t, encoding="utf-8")
print("patched contacts/[id]/contact-detail-form")

# --- 8. deals/[id]/deal-detail-form.tsx ---
p = pathlib.Path("src/app/deals/[id]/deal-detail-form.tsx")
t = p.read_text(encoding="utf-8")
if "from 'sonner'" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { toast } from 'sonner'\nimport { Card } from '@/components/ui/card'")
if "useEffect" not in t:
    t = t.replace("import { useActionState, useState, useTransition } from 'react'", "import { useActionState, useEffect, useState, useTransition } from 'react'")
t = t.replace(
    "  const [state, formAction, pending] = useActionState(boundUpdate, initialState)",
    "  const [state, formAction, pending] = useActionState(boundUpdate, initialState)\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success) toast.success('Deal updated')\n  }, [state.error, state.success])"
)
t = t.replace(
    "  function handleDelete() {\n    startDelete(async () => {\n      await deleteDealAction(deal.id)\n      router.push('/deals')\n    })\n  }",
    "  function handleDelete() {\n    startDelete(async () => {\n      const res = await deleteDealAction(deal.id)\n      if (res?.error) toast.error(res.error)\n      else if (res?.success) {\n        toast.success('Deal deleted')\n        router.push('/deals')\n      }\n    })\n  }"
)
p.write_text(t, encoding="utf-8")
print("patched deals/[id]/deal-detail-form")

# --- 9. admin/users/new/user-form.tsx ---
p = pathlib.Path("src/app/admin/users/new/user-form.tsx")
t = p.read_text(encoding="utf-8")
if "from 'sonner'" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { toast } from 'sonner'\nimport { Card } from '@/components/ui/card'")
if "useEffect" not in t:
    t = t.replace("import { useActionState, useState } from 'react'", "import { useActionState, useEffect, useState } from 'react'")
t = t.replace(
    "  const [state, formAction, pending] = useActionState(createUserAction, initialState)",
    "  const [state, formAction, pending] = useActionState(createUserAction, initialState)\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success || state.tempPassword) toast.success('User created')\n  }, [state.error, state.success, state.tempPassword])"
)
p.write_text(t, encoding="utf-8")
print("patched admin/users/new/user-form")

# --- 10. admin/users/[id]/user-detail-form.tsx ---
p = pathlib.Path("src/app/admin/users/[id]/user-detail-form.tsx")
t = p.read_text(encoding="utf-8")
if "from 'sonner'" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { toast } from 'sonner'\nimport { Card } from '@/components/ui/card'")
if "useEffect" not in t:
    t = t.replace("import { useActionState } from 'react'", "import { useActionState, useEffect, useState, useTransition } from 'react'")
if "useRouter" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { useRouter } from 'next/navigation'\nimport { Card } from '@/components/ui/card'")
# Add ConfirmDialog import if missing
if "ConfirmDialog" not in t:
    t = t.replace("import { Card } from '@/components/ui/card'", "import { ConfirmDialog } from '@/components/ui/confirm-dialog'\nimport { Card } from '@/components/ui/card'")
# Add router + toast effect + delete handler
t = t.replace(
    "  const boundUpdate = updateUserAction.bind(null, user.id)\n  const [state, formAction, pending] = useActionState(boundUpdate, initialState)",
    "  const router = useRouter()\n  const [deleting, startDelete] = useTransition()\n  const [confirmOpen, setConfirmOpen] = useState(false)\n  const boundUpdate = updateUserAction.bind(null, user.id)\n  const [state, formAction, pending] = useActionState(boundUpdate, initialState)\n  useEffect(() => {\n    if (state.error) toast.error(state.error)\n    if (state.success) toast.success('User updated')\n  }, [state.error, state.success])"
)
# Replace delete form with confirm dialog button
old_del = """      {!isSelf && (
        <div className="flex justify-end pt-4 border-t border-white/[0.06]">
          <form action={deleteUserAction.bind(null, user.id)}>
            <Button type="submit" variant="destructive" size="sm">
              Remove user
            </Button>
          </form>
        </div>
      )}"""
new_del = """      {!isSelf && (
        <div className="flex justify-end pt-4 border-t border-white/[0.06]">
          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmOpen(true)} disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove user'}
          </Button>
        </div>
      )}
      {!isSelf && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Remove \"${user.name}\"?`}
          description="This cannot be undone."
          confirmLabel="Remove"
          variant="destructive"
          loading={deleting}
          onConfirm={() => {
            startDelete(async () => {
              const res = await deleteUserAction(user.id)
              if (res?.error) toast.error(res.error)
              else if (res?.success) {
                toast.success('User removed')
                router.push('/admin/users')
              }
            })
          }}
        />
      )}"""
if old_del in t:
    t = t.replace(old_del, new_del)
    print("patched user detail delete")
else:
    print("MISS user detail delete")

p.write_text(t, encoding="utf-8")
print("patched admin/users/[id]/user-detail-form")

# --- 11. admin/roles/[id]/permission-matrix.tsx ---
p = pathlib.Path("src/app/admin/roles/[id]/permission-matrix.tsx")
t = p.read_text(encoding="utf-8")
if "from 'sonner'" not in t:
    t = t.replace("import { cn } from '@/lib/utils'", "import { toast } from 'sonner'\nimport { cn } from '@/lib/utils'")
# Update toggle to toast on error/success
t = t.replace(
    "    startTransition(async () => {\n      try {\n        await toggleRolePermissionAction(roleId, permissionId, willGrant)\n      } catch {\n        setGranted((prev) => {\n          const next = new Set(prev)\n          if (willGrant) next.delete(permissionId)\n          else next.add(permissionId)\n          return next\n        })\n      }\n    })",
    "    startTransition(async () => {\n      try {\n        const res = await toggleRolePermissionAction(roleId, permissionId, willGrant)\n        if (res?.error) {\n          toast.error(res.error)\n          setGranted((prev) => {\n            const next = new Set(prev)\n            if (willGrant) next.delete(permissionId)\n            else next.add(permissionId)\n            return next\n          })\n        } else {\n          toast.success(willGrant ? 'Permission granted' : 'Permission revoked')\n        }\n      } catch (e) {\n        toast.error(e instanceof Error ? e.message : 'Failed to update permission')\n        setGranted((prev) => {\n          const next = new Set(prev)\n          if (willGrant) next.delete(permissionId)\n          else next.add(permissionId)\n          return next\n        })\n      }\n    })"
)
p.write_text(t, encoding="utf-8")
print("patched permission-matrix")

print("done patch-phase5b forms")
