'use client'

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar, Search, Download } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { usePermissions } from '@/lib/permissions'
import { DateRange } from 'react-day-picker'

interface DailyReport {
  id: string
  userId: string
  date: string
  workDescription: string | null
  completedWork: string | null
  pendingWork: string | null
  blockers: string | null
  tomorrowPlan: string | null
  tasksCompletedCount: number
  crmRecordsUpdatedCount: number
  leadsWorkedOnCount: number
  filesUploadedCount: number
  activeWorkingTimeMinutes: number
  status: string
  userName: string
  userEmail: string
  aiSummary: string | null
}

interface ReportsResponse {
  reports: DailyReport[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface TeamMember {
  id: string
  name: string
  email: string
  designation: string | null
  team: string | null
  department: string | null
  status: string
  lastLoginAt: string | null
}

function getStatusBadge(status: string) {
  const variants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
    SUBMITTED: 'success',
    DRAFT: 'warning',
    MISSED: 'danger',
  }
  return <Badge variant={variants[status] ?? 'neutral'}>{status}</Badge>
}

export default function ReportsClient() {
  const { data: session } = useSession()
  const { hasPermission } = usePermissions()
  const canViewAll = hasPermission('team.view_all')

  const [reports, setReports] = useState<DailyReport[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)

  const [dateFrom, setDateFrom] = useState<string>(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [selectedUserId, setSelectedUserId] = useState<string>('__all__')
  const [statusFilter, setStatusFilter] = useState<string>('__all__')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (selectedUserId !== '__all__') params.set('userId', selectedUserId)
      if (statusFilter !== '__all__') params.set('status', statusFilter)
      if (searchQuery) params.set('search', searchQuery)
      params.set('page', page.toString())
      params.set('pageSize', '20')
      const res = await fetch(`/api/admin/my-team/reports?${params}`)
      if (res.ok) {
        const data: ReportsResponse = await res.json()
        setReports(data.reports)
        setTotalPages(data.totalPages)
      }
    } catch (e) {
      console.error('Failed to fetch reports:', e)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selectedUserId, statusFilter, page, searchQuery])

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/my-team/members')
      if (res.ok) {
        const data = await res.json()
        setMembers(data)
      }
    } catch (e) {
      console.error('Failed to fetch members:', e)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetch effect (fetch→setReports), not local-state sync
    fetchReports()
    if (canViewAll) fetchMembers()
  }, [canViewAll, fetchReports, fetchMembers])

  async function exportReports() {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (selectedUserId !== '__all__') params.set('userId', selectedUserId)
      if (statusFilter !== '__all__') params.set('status', statusFilter)
      params.set('page', '1')
      params.set('pageSize', '1000')
      const res = await fetch(`/api/admin/my-team/reports?${params}`)
      if (res.ok) {
        const data: ReportsResponse = await res.json()
        const csv = convertToCSV(data.reports)
        downloadCSV(csv, `daily-reports-${dateFrom}-to-${dateTo}.csv`)
      }
    } catch (e) {
      console.error('Failed to export reports:', e)
    }
  }

  function convertToCSV(reports: DailyReport[]): string {
    const headers = ['Date', 'Employee', 'Email', 'Status', 'Work Description', 'Completed Work', 'Pending Work', 'Blockers', 'Tomorrow Plan', 'Tasks', 'CRM Updates', 'Leads', 'Files', 'Active Minutes']
    const rows = reports.map(r => [
      format(new Date(r.date), 'yyyy-MM-dd'),
      r.userName,
      r.userEmail,
      r.status,
      r.workDescription ?? '',
      r.completedWork ?? '',
      r.pendingWork ?? '',
      r.blockers ?? '',
      r.tomorrowPlan ?? '',
      r.tasksCompletedCount.toString(),
      r.crmRecordsUpdatedCount.toString(),
      r.leadsWorkedOnCount.toString(),
      r.filesUploadedCount.toString(),
      r.activeWorkingTimeMinutes.toString(),
    ])
    return [headers.join(','), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n')
  }

  function downloadCSV(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!session) return null

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Daily Reports" subtitle="View and manage team daily reports" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Reports</h1>
          <p className="text-muted-foreground">View and manage team daily reports</p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[300px]" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                <span>{dateFrom} - {dateTo}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <DatePicker
                mode="range"
                selected={{ from: dateFrom ? new Date(dateFrom) : undefined, to: dateTo ? new Date(dateTo) : undefined }}
                onSelect={(date: Date | DateRange | Date[] | undefined) => {
                  if (date && typeof date === 'object' && 'from' in date) {
                    if (date.from) setDateFrom(format(date.from, 'yyyy-MM-dd'))
                    if (date.to) setDateTo(format(date.to, 'yyyy-MM-dd'))
                  }
                }}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={exportReports} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Reports</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search work description..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
              className="pl-9 w-[300px]"
            />
          </div>
          {canViewAll && (
            <Select value={selectedUserId} onValueChange={(v: string) => { setSelectedUserId(v); setPage(1) }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Members</SelectItem>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Status</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="MISSED">Missed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Work Description</TableHead>
                <TableHead>Completed Work</TableHead>
                <TableHead>Pending Work</TableHead>
                <TableHead>Blockers</TableHead>
                <TableHead>Tomorrow Plan</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="text-right">CRM</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead>AI Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : reports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">No reports found</TableCell>
                </TableRow>
              ) : (
                reports.map(report => (
                  <TableRow key={report.id}>
                    <TableCell>{format(new Date(report.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{report.userName}</TableCell>
                    <TableCell>{getStatusBadge(report.status)}</TableCell>
                    <TableCell className="max-w-xs truncate">{report.workDescription ?? '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{report.completedWork ?? '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{report.pendingWork ?? '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{report.blockers ?? '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{report.tomorrowPlan ?? '-'}</TableCell>
                    <TableCell className="text-right">{report.tasksCompletedCount}</TableCell>
                    <TableCell className="text-right">{report.crmRecordsUpdatedCount}</TableCell>
                    <TableCell className="text-right">{report.leadsWorkedOnCount}</TableCell>
                    <TableCell className="text-right">{report.filesUploadedCount}</TableCell>
                    <TableCell className="text-right">{report.activeWorkingTimeMinutes}</TableCell>
                    <TableCell>
                      {report.aiSummary ? (
                        <Badge variant="default" className="cursor-pointer" onClick={() => alert(report.aiSummary)}>
                          View Summary
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Not generated</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next
          </Button>
        </div>
      )}
      </div>
    </MainLayout>
  )
}
