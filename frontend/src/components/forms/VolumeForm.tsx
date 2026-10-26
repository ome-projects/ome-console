'use client'

import { UseFormRegister, useFieldArray, Control, useFormContext, useWatch } from 'react-hook-form'
import { isPlainObject } from '@/lib/utils/object'

interface VolumeFormProps {
  basePath: string
  register: UseFormRegister<any>
  control: Control<any>
}

/** The volume sources the form can write; each is the Kubernetes field of the same name. */
const VOLUME_TYPES = [
  { value: 'emptyDir', label: 'Empty Dir' },
  { value: 'configMap', label: 'ConfigMap', sourceField: 'name', sourceLabel: 'ConfigMap name' },
  { value: 'secret', label: 'Secret', sourceField: 'secretName', sourceLabel: 'Secret name' },
  {
    value: 'persistentVolumeClaim',
    label: 'Persistent Volume Claim',
    sourceField: 'claimName',
    sourceLabel: 'Claim name',
  },
  { value: 'hostPath', label: 'Host Path', sourceField: 'path', sourceLabel: 'Host path' },
] as const

type VolumeType = (typeof VOLUME_TYPES)[number]['value']

/** The form's type for a stored volume; '' for a source the form cannot edit (csi, nfs...). */
function volumeTypeOf(volume: unknown): VolumeType | '' {
  if (!isPlainObject(volume)) return ''
  return VOLUME_TYPES.find((type) => type.value in volume)?.value ?? ''
}

const inputClassName =
  'input-focus w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20'
const selectClassName =
  'input-focus w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20'
const labelClassName = 'field-label block text-xs text-slate-600 mb-1.5'

function VolumeItem({
  path,
  index,
  register,
  control,
  onRemove,
}: {
  path: string
  index: number
  register: UseFormRegister<any>
  control: Control<any>
  onRemove: () => void
}) {
  const { setValue } = useFormContext()
  const volume = useWatch({ control, name: path }) as unknown
  const volumeType = volumeTypeOf(volume)
  const type = VOLUME_TYPES.find((candidate) => candidate.value === volumeType)

  const changeType = (next: string) => {
    // The source object is the type, so changing it rewrites the volume around its name.
    const name = isPlainObject(volume) && typeof volume.name === 'string' ? volume.name : ''
    setValue(path, { name, [next]: {} }, { shouldDirty: true })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Volume {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors"
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${path}.name`} className={labelClassName}>
            Volume Name *
          </label>
          <input
            id={`${path}.name`}
            type="text"
            {...register(`${path}.name`)}
            className={inputClassName}
            placeholder="volume-name"
          />
        </div>
        <div>
          <label htmlFor={`${path}.type`} className={labelClassName}>
            Volume Type
          </label>
          <select
            id={`${path}.type`}
            value={volumeType}
            onChange={(event) => changeType(event.target.value)}
            className={selectClassName}
          >
            {volumeType === '' && <option value="">Other (kept as stored)</option>}
            {VOLUME_TYPES.map((candidate) => (
              <option key={candidate.value} value={candidate.value}>
                {candidate.label}
              </option>
            ))}
          </select>
        </div>
        {type && 'sourceField' in type && (
          <div>
            <label htmlFor={`${path}.${type.value}.${type.sourceField}`} className={labelClassName}>
              {type.sourceLabel} *
            </label>
            <input
              id={`${path}.${type.value}.${type.sourceField}`}
              type="text"
              {...register(`${path}.${type.value}.${type.sourceField}`)}
              className={inputClassName}
            />
          </div>
        )}
      </div>
      <div className="mt-3 text-xs text-slate-500">
        Other volume settings are kept as stored and can be edited in YAML
      </div>
    </div>
  )
}

export function VolumeForm({ basePath, register, control }: VolumeFormProps) {
  const {
    fields: volumeFields,
    append: appendVolume,
    remove: removeVolume,
  } = useFieldArray({
    control,
    name: basePath,
  })

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h5 className="text-sm font-display font-semibold text-slate-700">Volumes</h5>
        <button
          type="button"
          onClick={() => appendVolume({ name: '', emptyDir: {} })}
          className="rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:shadow-md transition-all"
        >
          + Add Volume
        </button>
      </div>
      <div className="space-y-3">
        {volumeFields.map((field, index) => (
          <VolumeItem
            key={field.id}
            path={`${basePath}.${index}`}
            index={index}
            register={register}
            control={control}
            onRemove={() => removeVolume(index)}
          />
        ))}
        {volumeFields.length === 0 && (
          <p className="text-xs text-slate-500 italic">No volumes defined</p>
        )}
      </div>
    </div>
  )
}
