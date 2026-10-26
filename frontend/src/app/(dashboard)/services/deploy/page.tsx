'use client'

import { useRouter } from 'next/navigation'
import { ServiceForm } from '@/components/forms/service'

export default function DeployServicePage() {
  const router = useRouter()

  return <ServiceForm mode="create" onSuccess={() => router.push('/services')} />
}
