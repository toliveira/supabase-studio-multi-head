import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { schemaAnalysisKeys } from './keys'
import type { ApplyMigrationResult } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomMutationOptions } from '@/types'

type ApplyMigrationVariables = { sql: string; targetProject: string; dryRun: boolean }

async function applyMigration(vars: ApplyMigrationVariables): Promise<ApplyMigrationResult> {
  const response = await fetch('/api/schema-analysis/apply-migration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vars),
  })
  if (!response.ok) throw new Error(`Failed to apply migration: ${response.statusText}`)
  return response.json()
}

export type ApplyMigrationData = Awaited<ReturnType<typeof applyMigration>>
export type ApplyMigrationError = ResponseError

export const useApplyMigrationMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<ApplyMigrationData, ApplyMigrationError, ApplyMigrationVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<ApplyMigrationData, ApplyMigrationError, ApplyMigrationVariables>({
    mutationFn: (vars) => applyMigration(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: schemaAnalysisKeys.analysis() })
      await queryClient.invalidateQueries({ queryKey: schemaAnalysisKeys.matrix() })
      await queryClient.invalidateQueries({ queryKey: schemaAnalysisKeys.recommendations() })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to apply migration: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
