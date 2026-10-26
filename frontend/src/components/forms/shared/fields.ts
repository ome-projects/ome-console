import type { FieldValues, UseFormReturn } from 'react-hook-form'

/** Register options for an optional numeric input: an empty input is `undefined`, not NaN. */
export const optionalNumber = {
  setValueAs: (value: unknown): number | undefined =>
    value === '' || value === null || value === undefined ? undefined : Number(value),
}

/** The error message of a field addressed by a runtime path, e.g. `${basePath}.minReplicas`. */
export function fieldError(form: UseFormReturn<FieldValues>, path: string): string | undefined {
  return form.getFieldState(path, form.formState).error?.message
}
