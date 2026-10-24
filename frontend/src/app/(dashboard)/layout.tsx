import { Sidebar } from '@/components/layout/Sidebar'
import { ServerEventsBridge } from '@/components/providers/ServerEventsBridge'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <ServerEventsBridge />
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  )
}
