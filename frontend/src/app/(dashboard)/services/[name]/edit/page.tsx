'use client'

import { useRouter } from 'next/navigation'
import { useService } from '@/lib/hooks/useServices'
import { useResourceRef } from '@/lib/hooks/useResourceRef'
import { withNamespace } from '@/lib/utils/links'
import { ServiceForm } from '@/components/forms/service'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'

/**
 * Edits an InferenceService with the same form the deploy page uses. The YAML tab opens first:
 * the form owns only the common fields, and the YAML shows the whole stored object.
 */
export default function EditServicePage() {
  const { name, namespace } = useResourceRef()
  const router = useRouter()
  const { data: service, isLoading, error } = useService(name, namespace)
  const detailHref = withNamespace(`/services/${name}`, namespace)

  if (isLoading) return <LoadingState message="Loading service..." />
  if (error || !service) {
    return (
      <ErrorState
        error={error ?? new Error('Service not found')}
        backLink={{ href: '/services', label: 'Back to Services' }}
      />
    )
  }

  return (
    <ServiceForm
      mode="edit"
      initialData={service}
      defaultTab="yaml"
      onSuccess={() => router.push(detailHref)}
      backLink={detailHref}
      backLinkText="Back to Service Details"
    />
  )
}
