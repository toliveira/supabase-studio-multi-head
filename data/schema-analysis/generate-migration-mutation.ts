import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  MigrationScript,
  MigrationValidationResult,
  Recommendation,
} from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomMutationOptions } from '@/types'

type GenerateMigrationResponse = MigrationScript & { validation: MigrationValidationResult }

async function generateMigration(recommendation: Recommendation): Promise<GenerateMigrationResponse> {
  const response = await fetch('/api/schema-analysis/generate-migration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recommendation),
  })
  if (!response.ok) throw new Error(`Failed to generate migration: ${response.statusText}`)
  return response.json()
}

export type GenerateMigrationData = Awaited<ReturnType<typeof generateMigration>>
export type GenerateMigrationError = ResponseError

export const useGenerateMigrationMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<GenerateMigrationData, GenerateMigrationError, Recommendation>,
  'mutationFn'
> = {}) => {
  return useMutation<GenerateMigrationData, GenerateMigrationError, Recommendation>({
    mutationFn: (rec) => generateMigration(rec),
    async onSuccess(data, variables, context) {
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to generate migration: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
