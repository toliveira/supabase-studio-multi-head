import { useState } from 'react'

import {
  Tabs_Shadcn_ as Tabs,
  TabsList_Shadcn_ as TabsList,
  TabsTrigger_Shadcn_ as TabsTrigger,
  TabsContent_Shadcn_ as TabsContent,
} from 'ui'
import { toast } from 'sonner'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

import { useSchemaAnalysisQuery } from '@/data/schema-analysis/schema-analysis-query'
import { useRecommendationsQuery } from '@/data/schema-analysis/recommendations-query'
import { useGenerateMigrationMutation } from '@/data/schema-analysis/generate-migration-mutation'
import { useApplyMigrationMutation } from '@/data/schema-analysis/apply-migration-mutation'
import type {
  MigrationScript,
  MigrationValidationResult,
  Recommendation,
} from '@/lib/schema-analysis/types'

import { SchemaMatrix } from './SchemaMatrix'
import { RecommendationsPanel } from './RecommendationsPanel'
import { MigrationPreview } from './MigrationPreview'
import { ProgressTracker } from './ProgressTracker'

type GeneratedMigration = MigrationScript & { validation: MigrationValidationResult }

interface StatCardProps {
  label: string
  value: string | number
  tone?: 'default' | 'brand'
}

const StatCard = ({ label, value, tone = 'default' }: StatCardProps) => (
  <div className="border border-default rounded-md bg-surface-100 px-4 py-3 flex flex-col gap-1">
    <span className="text-xs uppercase tracking-wide text-foreground-lighter">{label}</span>
    <span
      className={`text-2xl font-mono ${tone === 'brand' ? 'text-brand-600' : 'text-foreground'}`}
    >
      {value}
    </span>
  </div>
)

export const SchemaAnalysisDashboard = () => {
  const {
    data: analysis,
    isLoading: analysisLoading,
    error: analysisError,
  } = useSchemaAnalysisQuery()
  const {
    data: recommendations,
    isLoading: recommendationsLoading,
    error: recommendationsError,
  } = useRecommendationsQuery()

  const [previewVisible, setPreviewVisible] = useState(false)
  const [activeMigration, setActiveMigration] = useState<GeneratedMigration | null>(null)

  const generateMutation = useGenerateMigrationMutation({
    onSuccess: (data) => {
      setActiveMigration(data as GeneratedMigration)
      setPreviewVisible(true)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to generate migration'
      toast.error(message)
    },
  })

  const applyMutation = useApplyMigrationMutation({
    onSuccess: (data) => {
      const msg =
        data?.message ??
        (data?.dryRun ? 'Dry run completed.' : 'Migration applied successfully.')
      toast.success(msg)
      if (!data?.dryRun) {
        setPreviewVisible(false)
        setActiveMigration(null)
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to apply migration'
      toast.error(message)
    },
  })

  const handleGenerateMigration = (rec: Recommendation) => {
    generateMutation.mutate(rec)
  }

  const handleApply = (sql: string, targetProject: string, dryRun: boolean) => {
    applyMutation.mutate({ sql, targetProject, dryRun })
  }

  const handleClosePreview = () => {
    if (applyMutation.isPending) return
    setPreviewVisible(false)
  }

  if (analysisLoading || recommendationsLoading) {
    return (
      <div className="flex flex-col gap-4">
        <GenericSkeletonLoader />
        <GenericSkeletonLoader />
      </div>
    )
  }

  if (analysisError || !analysis) {
    return (
      <div className="border border-destructive-500/30 bg-destructive-200/10 rounded-md p-4 text-sm text-destructive-600">
        Failed to load schema analysis.
        {analysisError instanceof Error ? ` ${analysisError.message}` : ''}
      </div>
    )
  }

  const recs = recommendations ?? []

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Standardization"
          value={`${Math.round(analysis.standardizationScore)}%`}
          tone="brand"
        />
        <StatCard label="Projects" value={analysis.totalProjects} />
        <StatCard label="Unique tables" value={analysis.uniqueTables} />
        <StatCard label="Similar pairs" value={analysis.similarPairsCount} />
      </section>

      <Tabs defaultValue="matrix" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="matrix">Schema Matrix</TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-2">
            Recommendations
            {recs.length > 0 ? (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-300 text-foreground-light">
                {recs.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="m-0">
          <SchemaMatrix matrix={analysis.matrix} />
        </TabsContent>

        <TabsContent value="recommendations" className="m-0">
          {recommendationsError ? (
            <div className="border border-destructive-500/30 bg-destructive-200/10 rounded-md p-4 text-sm text-destructive-600">
              Failed to load recommendations.
            </div>
          ) : (
            <RecommendationsPanel
              recommendations={recs}
              onGenerateMigration={handleGenerateMigration}
            />
          )}
        </TabsContent>

        <TabsContent value="progress" className="m-0">
          <ProgressTracker analysis={analysis} />
        </TabsContent>
      </Tabs>

      <MigrationPreview
        visible={previewVisible}
        onClose={handleClosePreview}
        migration={activeMigration}
        onApply={handleApply}
        isApplying={applyMutation.isPending}
      />
    </div>
  )
}

export default SchemaAnalysisDashboard
