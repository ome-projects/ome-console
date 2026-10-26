'use client'

import { useRuntime } from '@/lib/hooks/useRuntimes'
import { useRouter } from 'next/navigation'
import { useResourceRef } from '@/lib/hooks/useResourceRef'
import { withNamespace } from '@/lib/utils'
import { RuntimeForm } from '@/components/forms/runtime'
import { ErrorState } from '@/components/ui/ErrorState'

export default function EditRuntimePage() {
  const { name, namespace } = useResourceRef()
  const router = useRouter()
  const { data: runtime, isLoading: isLoadingRuntime } = useRuntime(name, namespace)
  const detailLink = withNamespace(`/runtimes/${name}`, namespace)

  if (!isLoadingRuntime && !runtime) {
    return (
      <ErrorState
        error={new Error('Runtime not found')}
        backLink={{ href: '/runtimes', label: 'Back to Runtimes' }}
      />
    )
  }

  return (
    <RuntimeForm
      mode="edit"
      initialData={runtime}
      onSuccess={() => router.push(detailLink)}
      isLoading={isLoadingRuntime}
      backLink={detailLink}
      backLinkText="Back to Runtime Details"
    />
  )
}
