import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { exportAsYaml, resourceEditHref, resourceKey } from '@/lib/utils'
import { Icons } from '@/components/ui/Icons'
import type { BulkAction } from '@/components/ui/BulkActionDropdown'
import type { ResourceRef } from '@/lib/api/createResourceApi'

interface ResourceWithMetadata {
  metadata: { name: string; namespace?: string }
}

interface UseBulkSelectionOptions<T extends ResourceWithMetadata> {
  items: T[]
  resourceType: string
  basePath: string
  deleteMutation: { mutateAsync: (ref: ResourceRef) => Promise<unknown> }
  /** Link to an item's edit page; defaults to `<basePath>/<name>/edit?namespace=<ns>`. */
  editHref?: (item: T) => string
}

/**
 * Hook for managing bulk selection and actions in resource list pages. Items are tracked by
 * `resourceKey` (namespace/name), so same-named objects in different namespaces stay distinct.
 */
export function useBulkSelection<T extends ResourceWithMetadata>({
  items,
  resourceType,
  basePath,
  deleteMutation,
  editHref = (item) => resourceEditHref(basePath, item),
}: UseBulkSelectionOptions<T>) {
  const router = useRouter()
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Prune selection when items change (namespace filter, data refresh)
  useEffect(() => {
    const currentKeys = new Set(items.map(resourceKey))
    setSelectedItems((prev) => {
      const pruned = new Set([...prev].filter((key) => currentKeys.has(key)))
      return pruned.size !== prev.size ? pruned : prev
    })
  }, [items])

  const allSelected = items.length > 0 && selectedItems.size === items.length
  const someSelected = selectedItems.size > 0 && selectedItems.size < items.length

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedItems(checked ? new Set(items.map(resourceKey)) : new Set())
    },
    [items]
  )

  const handleSelectItem = useCallback((key: string, checked: boolean) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      checked ? next.add(key) : next.delete(key)
      return next
    })
  }, [])

  const selectedData = useMemo(
    () => items.filter((item) => selectedItems.has(resourceKey(item))),
    [items, selectedItems]
  )

  const handleBulkDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      for (const item of selectedData) {
        await deleteMutation.mutateAsync({
          name: item.metadata.name,
          namespace: item.metadata.namespace,
        })
      }
      setSelectedItems(new Set())
      setShowDeleteModal(false)
    } catch (err) {
      console.error(`Failed to delete ${resourceType}s:`, err)
    } finally {
      setIsDeleting(false)
    }
  }, [selectedData, deleteMutation, resourceType])

  const bulkActions: BulkAction[] = useMemo(
    () => [
      {
        id: 'export',
        label: 'Export YAML',
        icon: <Icons.downloadFile size="sm" />,
        onClick: () =>
          selectedData.forEach((item) => exportAsYaml(item, `${item.metadata.name}.yaml`)),
        disabled: selectedItems.size === 0,
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: <Icons.pencil size="sm" />,
        onClick: () => {
          if (selectedData.length === 1) {
            router.push(editHref(selectedData[0]))
          }
        },
        disabled: selectedItems.size !== 1,
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: <Icons.trash size="sm" />,
        onClick: () => setShowDeleteModal(true),
        disabled: selectedItems.size === 0,
        variant: 'destructive',
      },
    ],
    [selectedData, selectedItems.size, editHref, router]
  )

  const deleteModalResourceName =
    selectedData.length === 1
      ? selectedData[0].metadata.name
      : `${selectedItems.size} ${resourceType}s`

  return {
    selectedItems,
    showDeleteModal,
    isDeleting,
    allSelected,
    someSelected,
    handleSelectAll,
    handleSelectItem,
    handleBulkDelete,
    closeDeleteModal: () => setShowDeleteModal(false),
    bulkActions,
    deleteModalResourceName,
  }
}
