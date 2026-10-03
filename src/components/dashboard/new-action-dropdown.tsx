'use client'

import Link from 'next/link'
import { Plus, Target, Building2, User, Handshake, Sparkles, ClipboardList, Upload, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const ACTIONS = [
  { label: 'New Lead', href: '/leads/new', icon: Target },
  { label: 'New Company', href: '/companies/new', icon: Building2 },
  { label: 'New Contact', href: '/contacts/new', icon: User },
  { label: 'New Deal', href: '/deals/new', icon: Handshake },
  { label: 'New Meeting (MOM)', href: '/meetings/new', icon: Sparkles },
  { label: 'Create Follow-up', href: '/follow-ups/new', icon: ClipboardList },
  { label: 'Upload Document', href: '/files/upload', icon: Upload },
  { label: "Submit Daily Report", href: '/dashboard/daily-report', icon: ClipboardCheck },
]

export function NewActionDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="h-4 w-4" />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-[#0d1622] border-white/10">
        {ACTIONS.map((action) => (
          <DropdownMenuItem key={action.href} asChild className="text-white/75 hover:bg-white/5 focus:bg-white/5">
            <Link href={action.href} className="flex items-center gap-2 w-full">
              <action.icon className="h-4 w-4" />
              {action.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
