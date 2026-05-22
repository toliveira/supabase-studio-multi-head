import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import DefaultLayout from '@/components/layouts/DefaultLayout'
import { SchemaAnalysisDashboard } from '@/components/schema-analysis/SchemaAnalysisDashboard'
import type { NextPageWithLayout } from '@/types'

const SchemaAnalysisPage: NextPageWithLayout = () => {
  return (
    <>
      <PageHeader size="large">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>Schema Analysis</PageHeaderTitle>
            <PageHeaderDescription>
              Compare and standardize database schemas across all managed projects
            </PageHeaderDescription>
          </PageHeaderSummary>
        </PageHeaderMeta>
      </PageHeader>
      <PageContainer size="large">
        <SchemaAnalysisDashboard />
      </PageContainer>
    </>
  )
}

SchemaAnalysisPage.getLayout = (page) => <DefaultLayout>{page}</DefaultLayout>

export default SchemaAnalysisPage
