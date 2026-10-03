import Link from 'next/link'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { CreateFolderButton } from '@/components/files/create-folder-button'
import { Folder, Info } from 'lucide-react'
import { getAllFoldersFlat } from '@/services/file.service'

export const metadata = { title: 'Folders & Access | Kawman ExAct' }

interface FolderNode {
  id: string
  name: string
  parentId: string | null
  children: FolderNode[]
}

function buildTree(flat: { id: string; name: string; parentId: string | null }[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(flat.map((f) => [f.id, { ...f, children: [] }]))
  const roots: FolderNode[] = []
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function FolderTreeItem({ node, depth }: { node: FolderNode; depth: number }) {
  return (
    <div>
      <Link
        href={`/files/my-files?folder=${node.id}`}
        className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-white/[0.05] transition-colors text-sm text-white/70 hover:text-white"
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        {node.name}
      </Link>
      {node.children.map((child) => (
        <FolderTreeItem key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export default async function FoldersAccessPage() {
  const flat = await getAllFoldersFlat()
  const tree = buildTree(flat)

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Folders & Access"
          subtitle={`${flat.length} folders`}
          action={<CreateFolderButton parentId={null} />}
        />

        <div className="flex items-start gap-2 text-xs text-white/40 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Per-file access is controlled from each file&apos;s Share menu in My Files. Visibility (private, team,
          department, organization) is set when a file is uploaded.
        </div>

        <Card className="bg-[#0a111c]/80 border-white/[0.08] p-2">
          {tree.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-10">No folders yet</p>
          ) : (
            tree.map((node) => <FolderTreeItem key={node.id} node={node} depth={0} />)
          )}
        </Card>
      </div>
    </MainLayout>
  )
}
