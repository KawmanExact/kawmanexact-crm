import pathlib

def patch_leads():
    p = pathlib.Path("src/components/crm/leads-table.tsx")
    t = p.read_text(encoding="utf-8")
    # Add hasActiveFilters after allSelected
    if "hasActiveFilters" not in t:
        t = t.replace(
            "  const allSelected = leads.length > 0 && selected.size === leads.length",
            "  const allSelected = leads.length > 0 && selected.size === leads.length\n  const hasActiveFilters = Boolean(searchParams.get('q')?.trim() || (searchParams.get('status') && searchParams.get('status') !== 'ALL'))"
        )
    # Make table hidden on mobile
    t = t.replace(
        '      <div className="overflow-x-auto">\n        <table',
        '      <div className="hidden md:block overflow-x-auto">\n        <table'
    )
    # Replace empty state text inside table
    old_empty = """            {leads.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-white/40">
                  No leads match your filters.
                </td>
              </tr>
            )}"""
    new_empty = """            {leads.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center">
                  {hasActiveFilters ? (
                    <span className="text-white/40">No leads match your filters.</span>
                  ) : (
                    <span className="flex flex-col items-center gap-3">
                      <span className="text-white/40">No leads yet.</span>
                      <Link
                        href="/leads/new"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                      >
                        Create your first lead
                      </Link>
                    </span>
                  )}
                </td>
              </tr>
            )}"""
    if old_empty in t:
        t = t.replace(old_empty, new_empty)
        print("patched leads table empty desktop")
    else:
        print("MISS leads table empty")
        print(repr(t[t.find("No leads match"):t.find("No leads match")+500]))

    # Add mobile card view after the table div closes (before pagination)
    # Table block ends with "      </div>\n\n      {pageCount > 1 &&"
    old_close = "      </div>\n\n      {pageCount > 1 && ("
    new_close = """      </div>

      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-white/[0.04]">
        {leads.map((lead: Lead) => (
          <div key={lead.id} className="p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-white hover:text-purple-300 truncate">
                {lead.name}
              </Link>
              <Badge variant={STATUS_VARIANT[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <span className="text-white/35">Company</span><span className="text-white/70 truncate text-right">{lead.company || '—'}</span>
              <span className="text-white/35">Owner</span><span className="text-white/70 truncate text-right">{lead.owner}</span>
              <span className="text-white/35">Source</span><span className="text-white/55 text-right">{lead.source}</span>
              <span className="text-white/35">Score</span><span className="text-white/70 text-right">{lead.score}</span>
              <span className="text-white/35">Value</span><span className="text-white font-medium text-right">{formatCurrency(lead.value)}</span>
              <span className="text-white/35">Last activity</span><span className="text-white/45 text-right">{lead.lastActivityAt}</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={selected.has(lead.id)}
                onChange={() => toggleRow(lead.id)}
                className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600"
                aria-label={`Select ${lead.name}`}
              />
              <span className="text-xs text-white/30">Select</span>
              <span className="text-xs text-white/40 truncate ml-auto">{lead.email}</span>
            </div>
          </div>
        ))}
        {leads.length === 0 && (
          <div className="px-4 py-10 text-center">
            {hasActiveFilters ? (
              <span className="text-sm text-white/40">No leads match your filters.</span>
            ) : (
              <span className="flex flex-col items-center gap-3">
                <span className="text-sm text-white/40">No leads yet.</span>
                <Link
                  href="/leads/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                >
                  Create your first lead
                </Link>
              </span>
            )}
          </div>
        )}
      </div>

      {pageCount > 1 && ("""
    if old_close in t and "Mobile card view" not in t:
        t = t.replace(old_close, new_close, 1)
        print("patched leads mobile cards")
    elif "Mobile card view" in t:
        print("leads mobile already patched")
    else:
        print("MISS leads mobile close")
    p.write_text(t, encoding="utf-8")
    print("done leads")

def patch_companies():
    p = pathlib.Path("src/components/crm/companies-table.tsx")
    t = p.read_text(encoding="utf-8")
    if "hasActiveFilters" not in t:
        t = t.replace(
            "  const { companies, total, page, pageCount } = result",
            "  const hasActiveFilters = Boolean(searchParams.get('q')?.trim() || (searchParams.get('status') && searchParams.get('status') !== 'ALL'))\n  const { companies, total, page, pageCount } = result"
        )
    t = t.replace(
        '      <div className="overflow-x-auto">\n        <table',
        '      <div className="hidden md:block overflow-x-auto">\n        <table'
    )
    old_empty = """            {companies.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-white/40">
                  No companies match your filters.
                </td>
              </tr>
            )}"""
    new_empty = """            {companies.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  {hasActiveFilters ? (
                    <span className="text-white/40">No companies match your filters.</span>
                  ) : (
                    <span className="flex flex-col items-center gap-3">
                      <span className="text-white/40">No companies yet.</span>
                      <Link
                        href="/companies/new"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                      >
                        Create your first company
                      </Link>
                    </span>
                  )}
                </td>
              </tr>
            )}"""
    if old_empty in t:
        t = t.replace(old_empty, new_empty)
        print("patched companies empty desktop")
    else:
        print("MISS companies empty")
    old_close = "      </div>\n\n      {pageCount > 1 && ("
    new_close = """      </div>

      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-white/[0.04]">
        {companies.map((company) => (
          <div key={company.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/companies/${company.id}`} className="text-sm font-medium text-white hover:text-purple-300 truncate">
                {company.name}
              </Link>
              <Badge variant={company.status === 'ACTIVE' ? 'success' : 'neutral'}>{company.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-white/35">Industry</span><span className="text-white/70 text-right truncate">{company.industry || '—'}</span>
              <span className="text-white/35">Location</span><span className="text-white/60 text-right truncate">{company.city ? `${company.city}, ${company.state}` : '—'}</span>
              <span className="text-white/35">Employees</span><span className="text-white/70 text-right">{company.employees ?? '—'}</span>
              <span className="text-white/35">Revenue</span><span className="text-white font-medium text-right">{formatCurrency(company.revenue)}</span>
              <span className="text-white/35">Owner</span><span className="text-white/70 text-right truncate">{company.owner}</span>
            </div>
            <div className="flex justify-end pt-1">
              <DeleteRowButton action={deleteCompanyAction.bind(null, company.id)} confirmLabel={`Delete ${company.name}? This also removes its contacts and deals.`} />
            </div>
          </div>
        ))}
        {companies.length === 0 && (
          <div className="px-4 py-10 text-center">
            {hasActiveFilters ? (
              <span className="text-sm text-white/40">No companies match your filters.</span>
            ) : (
              <span className="flex flex-col items-center gap-3">
                <span className="text-sm text-white/40">No companies yet.</span>
                <Link href="/companies/new" className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">Create your first company</Link>
              </span>
            )}
          </div>
        )}
      </div>

      {pageCount > 1 && ("""
    if old_close in t and "Mobile card view" not in t:
        t = t.replace(old_close, new_close, 1)
        print("patched companies mobile")
    elif "Mobile card view" in t:
        print("companies mobile already patched")
    else:
        print("MISS companies mobile close")
    p.write_text(t, encoding="utf-8")
    print("done companies")

def patch_contacts():
    p = pathlib.Path("src/components/crm/contacts-table.tsx")
    t = p.read_text(encoding="utf-8")
    # hasActiveFilters based on q
    if "hasActiveFilters" not in t:
        t = t.replace(
            "  const { contacts, total, page, pageCount } = result",
            "  const hasActiveFilters = Boolean(searchParams.get('q')?.trim())\n  const { contacts, total, page, pageCount } = result"
        )
    old_empty = """        {contacts.length === 0 && (
          <div className="col-span-full py-10 text-center text-white/40 text-sm">No contacts match your search.</div>
        )}"""
    new_empty = """        {contacts.length === 0 && (
          <div className="col-span-full py-10 text-center">
            {hasActiveFilters ? (
              <span className="text-sm text-white/40">No contacts match your search.</span>
            ) : (
              <span className="flex flex-col items-center gap-3">
                <span className="text-sm text-white/40">No contacts yet.</span>
                <Link href="/contacts/new" className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">Create your first contact</Link>
              </span>
            )}
          </div>
        )}"""
    if old_empty in t:
        t = t.replace(old_empty, new_empty)
        print("patched contacts empty")
    else:
        print("MISS contacts empty")
        idx = t.find("No contacts match")
        print(repr(t[max(0,idx-200):idx+300]))
    p.write_text(t, encoding="utf-8")
    print("done contacts")

def patch_deals():
    p = pathlib.Path("src/components/crm/deals-kanban.tsx")
    t = p.read_text(encoding="utf-8")
    # Add hasActiveFilters + empty handling before the kanban flex
    if "hasActiveFilters" not in t:
        t = t.replace(
            "  const [query, setQuery] = useState(searchParams.get('q') ?? '')",
            "  const hasActiveFilters = Boolean(searchParams.get('q')?.trim())\n  const [query, setQuery] = useState(searchParams.get('q') ?? '')"
        )
    # Deals kanban already is horizontal scroll; keep as-is but add top empty banner for zero deals
    # Insert after search input div closing
    old_after_search = '      </div>\n      <div className="flex gap-4 overflow-x-auto pb-2">'
    new_after_search = """      </div>
      {deals.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-10 text-center">
          {hasActiveFilters ? (
            <span className="text-sm text-white/40">No deals match your search.</span>
          ) : (
            <span className="flex flex-col items-center gap-3">
              <span className="text-sm text-white/40">No deals yet.</span>
              <Link href="/deals/new" className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">Create your first deal</Link>
            </span>
          )}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2">"""
    if old_after_search in t and 'No deals yet' not in t:
        t = t.replace(old_after_search, new_after_search, 1)
        print("patched deals empty banner")
    elif 'No deals yet' in t:
        print("deals already patched")
    else:
        print("MISS deals after_search")
    p.write_text(t, encoding="utf-8")
    print("done deals")

patch_leads()
patch_companies()
patch_contacts()
patch_deals()
print("all 5e patched")
