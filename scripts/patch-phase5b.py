import pathlib

# Leads
p = pathlib.Path("src/app/leads/actions.ts")
t = p.read_text(encoding="utf-8")
if "createdId" not in t:
    t = t.replace(
        "export interface LeadFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n  success?: boolean\n}",
        "export interface LeadFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n  success?: boolean\n  createdId?: string\n}"
    )
# createLeadAction: remove redirect import usage? keep import for other redirects (convert), just patch return
if "return { success: true, createdId: lead.id }" not in t:
    t = t.replace(
        "  revalidatePath('/leads')\n  revalidatePath('/dashboard')\n  redirect(`/leads/${lead.id}`)",
        "  revalidatePath('/leads')\n  revalidatePath('/dashboard')\n  return { success: true, createdId: lead.id }"
    )
# updateLeadAction already returns success true, leave
# deleteLeadAction
t = t.replace(
    "export async function deleteLeadAction(id: string): Promise<void> {",
    "export async function deleteLeadAction(id: string): Promise<{ success?: boolean; error?: string }> {"
)
# patch delete redirect if not yet
if "  revalidatePath('/leads')\n  revalidatePath('/dashboard')\n  return { success: true }\n}\n\nexport async function convertLeadToDealAction" not in t:
    # find the delete block specifically
    # it contains revalidate /leads + /dashboard then redirect('/leads')
    # after previous patch, check if redirect still exists
    if "redirect('/leads')" in t:
        t = t.replace(
            "  revalidatePath('/leads')\n  revalidatePath('/dashboard')\n  redirect('/leads')",
            "  revalidatePath('/leads')\n  revalidatePath('/dashboard')\n  return { success: true }"
        )
p.write_text(t, encoding="utf-8")
print("patched leads")

# Companies
p = pathlib.Path("src/app/companies/actions.ts")
t = p.read_text(encoding="utf-8")
if "createdId" not in t:
    t = t.replace(
        "export interface CompanyFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n}",
        "export interface CompanyFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n  success?: boolean\n  createdId?: string\n}"
    )
# updateCompanyAction return {} -> success
t = t.replace(
    "  revalidatePath('/companies')\n  revalidatePath(`/companies/${id}`)\n  return {}",
    "  revalidatePath('/companies')\n  revalidatePath(`/companies/${id}`)\n  return { success: true }"
)
# createCompanyAction redirect
if "return { success: true, createdId: company.id }" not in t:
    t = t.replace(
        "  revalidatePath('/companies')\n  redirect('/companies')",
        "  revalidatePath('/companies')\n  return { success: true, createdId: company.id }"
    )
t = t.replace(
    "export async function deleteCompanyAction(id: string): Promise<void> {",
    "export async function deleteCompanyAction(id: string): Promise<{ success?: boolean; error?: string }> {"
)
# deleteCompany: patch return
if "return { success: true }\n}" in t:
    pass
else:
    # find last occurrence pattern
    if "  revalidatePath('/companies')\n}" in t:
        idx = t.rfind("  revalidatePath('/companies')\n}")
        t = t[:idx] + "  revalidatePath('/companies')\n  return { success: true }\n}" + t[idx+len("  revalidatePath('/companies')\n}"):]
p.write_text(t, encoding="utf-8")
print("patched companies")

# Contacts
p = pathlib.Path("src/app/contacts/actions.ts")
t = p.read_text(encoding="utf-8")
if "createdId" not in t:
    t = t.replace(
        "export interface ContactFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n}",
        "export interface ContactFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n  success?: boolean\n  createdId?: string\n}"
    )
t = t.replace(
    "  revalidatePath('/contacts')\n  revalidatePath(`/contacts/${id}`)\n  return {}",
    "  revalidatePath('/contacts')\n  revalidatePath(`/contacts/${id}`)\n  return { success: true }"
)
if "return { success: true, createdId: contact.id }" not in t:
    t = t.replace(
        "  revalidatePath('/contacts')\n  redirect('/contacts')",
        "  revalidatePath('/contacts')\n  return { success: true, createdId: contact.id }"
    )
t = t.replace(
    "export async function deleteContactAction(id: string): Promise<void> {",
    "export async function deleteContactAction(id: string): Promise<{ success?: boolean; error?: string }> {"
)
if t.count("  revalidatePath('/contacts')\n}") >= 1 and "return { success: true }\n}\n" not in t.split("deleteContactAction")[1] if "deleteContactAction" in t else True:
    # patch only delete block (last occurrence)
    idx = t.rfind("  revalidatePath('/contacts')\n}")
    # ensure we patch the delete one not the update one (update already has success)
    # check if around idx there's delete log
    snippet = t[max(0, idx-500):idx]
    if "deleteContactAction" in snippet or "CONTACT" in snippet or True:
        # naive: if last occurrence not yet patched, patch it
        # check if already has return success nearby
        after = t[idx:idx+100]
        if "return { success" not in after:
            t = t[:idx] + "  revalidatePath('/contacts')\n  return { success: true }\n}" + t[idx+len("  revalidatePath('/contacts')\n}"):]
p.write_text(t, encoding="utf-8")
print("patched contacts")

# Deals
p = pathlib.Path("src/app/deals/actions.ts")
t = p.read_text(encoding="utf-8")
if "createdId" not in t:
    t = t.replace(
        "export interface DealFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n}",
        "export interface DealFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n  success?: boolean\n  createdId?: string\n}"
    )
t = t.replace(
    "  revalidatePath('/deals')\n  revalidatePath(`/deals/${id}`)\n  revalidatePath('/dashboard')\n  return {}",
    "  revalidatePath('/deals')\n  revalidatePath(`/deals/${id}`)\n  revalidatePath('/dashboard')\n  return { success: true }"
)
if "return { success: true, createdId: deal.id }" not in t:
    t = t.replace(
        "  revalidatePath('/deals')\n  revalidatePath('/dashboard')\n  redirect('/deals')",
        "  revalidatePath('/deals')\n  revalidatePath('/dashboard')\n  return { success: true, createdId: deal.id }"
    )
t = t.replace(
    "export async function deleteDealAction(id: string): Promise<void> {",
    "export async function deleteDealAction(id: string): Promise<{ success?: boolean; error?: string }> {"
)
# deleteDeal: find its block
if "revalidatePath('/deals')\n  revalidatePath('/dashboard')\n  return { success: true }\n}" not in t:
    # patch last occurrence of that pattern
    target = "  revalidatePath('/deals')\n  revalidatePath('/dashboard')\n}"
    idx = t.rfind(target)
    if idx != -1:
        t = t[:idx] + "  revalidatePath('/deals')\n  revalidatePath('/dashboard')\n  return { success: true }\n}" + t[idx+len(target):]
p.write_text(t, encoding="utf-8")
print("patched deals")

# Users
p = pathlib.Path("src/app/admin/users/actions.ts")
t = p.read_text(encoding="utf-8")
if "  success?: boolean" not in t or "export interface UserFormState" in t and "success" not in t.split("export interface UserFormState")[1].split("}")[0]:
    # ensure UserFormState has success
    if "  tempPassword?: string\n}" in t and "success?: boolean" not in t:
        t = t.replace(
            "export interface UserFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n  tempPassword?: string\n}",
            "export interface UserFormState {\n  error?: string\n  fieldErrors?: Record<string, string>\n  tempPassword?: string\n  success?: boolean\n}"
        )
        print("added success to UserFormState")
t = t.replace(
    "  revalidatePath('/admin/users')\n  revalidatePath(`/admin/users/${id}`)\n  return {}",
    "  revalidatePath('/admin/users')\n  revalidatePath(`/admin/users/${id}`)\n  return { success: true }"
)
t = t.replace(
    "export async function deleteUserAction(id: string): Promise<void> {",
    "export async function deleteUserAction(id: string): Promise<{ success?: boolean; error?: string }> {"
)
if "revalidatePath('/admin/users')\n  redirect('/admin/users')" in t:
    t = t.replace(
        "  revalidatePath('/admin/users')\n  redirect('/admin/users')",
        "  revalidatePath('/admin/users')\n  return { success: true }"
    )
p.write_text(t, encoding="utf-8")
print("patched users")

# Roles: toggleRolePermissionAction currently returns void, make it return status for toast
p = pathlib.Path("src/app/admin/roles/actions.ts")
t = p.read_text(encoding="utf-8")
t = t.replace(
    "export async function toggleRolePermissionAction(roleId: string, permissionId: string, grant: boolean): Promise<void> {",
    "export async function toggleRolePermissionAction(roleId: string, permissionId: string, grant: boolean): Promise<{ success?: boolean; error?: string }> {"
)
if "return { success: true }" not in t:
    t = t.replace(
        "  revalidatePath(`/admin/roles/${roleId}`)\n  revalidatePath('/admin/roles')\n}",
        "  revalidatePath(`/admin/roles/${roleId}`)\n  revalidatePath('/admin/roles')\n  return { success: true }\n}"
    )
p.write_text(t, encoding="utf-8")
print("patched roles")
print("done patch-phase5b server actions")
