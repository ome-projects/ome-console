'use client'

import { useRouter } from 'next/navigation'
import { RuntimeForm } from '@/components/forms/runtime'
import { resourceHref } from '@/lib/utils'

export default function CreateRuntimePage() {
  const router = useRouter()

  return (
    <RuntimeForm
      mode="create"
      onSuccess={(runtime) => router.push(resourceHref('/runtimes', runtime))}
      backLink="/runtimes"
      backLinkText="Back to Runtimes"
    />
  )
}
