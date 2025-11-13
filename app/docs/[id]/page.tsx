// apps/frontend/app/docs/[id]/page.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DocProxyPage({ params }: { params: { id?: string } }) {
  const router = useRouter()
  useEffect(() => {
    if (!params?.id) return
    // Redirect to canonical route used in your project
    router.replace(`/workspace/personal/documents/${encodeURIComponent(params.id)}`)
  }, [params, router])

  return <div>Redirecting to document…</div>
}