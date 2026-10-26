'use client'

import { useRuntime } from '@/lib/hooks/useRuntimes'
import { useRouter } from 'next/navigation'
import { useResourceRef } from '@/lib/hooks/useResourceRef'
import { resourceHref, withNamespace } from '@/lib/utils'
import { RuntimeForm } from '@/components/forms/runtime'
import { ErrorState } from '@/components/ui/ErrorState'
import { useMemo } from 'react'
import type { Runtime } from '@/lib/types/runtime'

export default function CloneRuntimePage() {
  const { name: sourceName, namespace } = useResourceRef()
  const router = useRouter()
  const { data: runtime, isLoading: isLoadingRuntime } = useRuntime(sourceName, namespace)

  // The clone keeps the source's scope and spec; the name is cleared for the user to enter.
  // The form drops the server-managed metadata (uid, resourceVersion...) when it creates.
  const clonedData = useMemo((): Runtime | undefined => {
    if (!runtime) return undefined
    return { ...runtime, metadata: { ...runtime.metadata, name: '' } }
  }, [runtime])

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
      mode="create"
      initialData={clonedData}
      onSuccess={(created) => router.push(resourceHref('/runtimes', created))}
      isLoading={isLoadingRuntime}
      backLink={withNamespace(`/runtimes/${sourceName}`, namespace)}
      backLinkText={`Back to ${sourceName}`}
      cloneFrom={sourceName}
    />
  )
}
