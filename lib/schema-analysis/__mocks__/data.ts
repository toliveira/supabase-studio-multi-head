/**
 * Mock Data for Schema Analysis Testing
 * 
 * This file provides comprehensive mock data for testing the schema analysis feature
 * without requiring actual Supabase project connections.
 * 
 * Use this data in:
 * - Unit tests for similarity detection
 * - Integration tests for API endpoints
 * - UI component testing
 * - Performance testing with large datasets
 */

import { TableSchema, ColumnDefinition, ForeignKeyConstraint, IndexDefinition } from '@/lib/schema-analysis/types'

// ============================================================================
// PROJECT A: Standard Schema (Baseline)
// ============================================================================

export const PROJECT_A_SCHEMA: TableSchema[] = [
  {
    projectId: 'project-a',
    tableName: 'users',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'users_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'email',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: ['UNIQUE'],
      },
      {
        name: 'username',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: ['UNIQUE'],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
      {
        name: 'updated_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    indexes: [
      {
        name: 'idx_users_email',
        columns: ['email'],
        unique: true,
      },
      {
        name: 'idx_users_username',
        columns: ['username'],
        unique: true,
      },
    ],
    rowCount: 1250,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-a',
    tableName: 'products',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'products_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'name',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'description',
        dataType: 'text',
        nullable: true,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'price',
        dataType: 'numeric(10,2)',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
      {
        name: 'updated_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    indexes: [
      {
        name: 'idx_products_name',
        columns: ['name'],
        unique: false,
      },
    ],
    rowCount: 3840,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-a',
    tableName: 'orders',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'orders_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'user_id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: undefined,
        constraints: ['FOREIGN KEY'],
      },
      {
        name: 'total_amount',
        dataType: 'numeric(10,2)',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'status',
        dataType: 'text',
        nullable: false,
        defaultValue: '\'pending\'::text',
        constraints: [],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
      {
        name: 'updated_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      {
        name: 'fk_orders_user_id',
        columns: ['user_id'],
        referencedTable: 'users',
        referencedColumns: ['id'],
      },
    ],
    indexes: [
      {
        name: 'idx_orders_user_id',
        columns: ['user_id'],
        unique: false,
      },
      {
        name: 'idx_orders_status',
        columns: ['status'],
        unique: false,
      },
    ],
    rowCount: 15600,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-a',
    tableName: 'audit_log',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'audit_log_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'entity_type',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'entity_id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'action',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'changes',
        dataType: 'jsonb',
        nullable: true,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    indexes: [
      {
        name: 'idx_audit_log_entity',
        columns: ['entity_type', 'entity_id'],
        unique: false,
      },
    ],
    rowCount: 125000,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
]

// ============================================================================
// PROJECT B: Variant Schema (Different naming, similar structure)
// ============================================================================

export const PROJECT_B_SCHEMA: TableSchema[] = [
  {
    projectId: 'project-b',
    tableName: 'user_accounts',
    columns: [
      {
        name: 'user_id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'user_accounts_user_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'email_address',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: ['UNIQUE'],
      },
      {
        name: 'account_name',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: ['UNIQUE'],
      },
      {
        name: 'created_timestamp',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
      {
        name: 'updated_timestamp',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['user_id'],
    foreignKeys: [],
    indexes: [
      {
        name: 'idx_user_accounts_email',
        columns: ['email_address'],
        unique: true,
      },
    ],
    rowCount: 1180,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-b',
    tableName: 'items',
    columns: [
      {
        name: 'item_id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'items_item_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'item_name',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'item_description',
        dataType: 'text',
        nullable: true,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'item_price',
        dataType: 'numeric(10,2)',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'created_timestamp',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
      {
        name: 'updated_timestamp',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['item_id'],
    foreignKeys: [],
    indexes: [
      {
        name: 'idx_items_name',
        columns: ['item_name'],
        unique: false,
      },
    ],
    rowCount: 3650,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-b',
    tableName: 'transactions',
    columns: [
      {
        name: 'transaction_id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'transactions_transaction_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'account_id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: undefined,
        constraints: ['FOREIGN KEY'],
      },
      {
        name: 'amount',
        dataType: 'numeric(10,2)',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'transaction_status',
        dataType: 'text',
        nullable: false,
        defaultValue: '\'pending\'::text',
        constraints: [],
      },
      {
        name: 'created_timestamp',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
      {
        name: 'updated_timestamp',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['transaction_id'],
    foreignKeys: [
      {
        name: 'fk_transactions_account_id',
        columns: ['account_id'],
        referencedTable: 'user_accounts',
        referencedColumns: ['user_id'],
      },
    ],
    indexes: [
      {
        name: 'idx_transactions_account_id',
        columns: ['account_id'],
        unique: false,
      },
    ],
    rowCount: 14800,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
]

// ============================================================================
// PROJECT C: Partial Schema (Missing some tables, has extras)
// ============================================================================

export const PROJECT_C_SCHEMA: TableSchema[] = [
  {
    projectId: 'project-c',
    tableName: 'users',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'users_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'email',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: ['UNIQUE'],
      },
      {
        name: 'username',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: ['UNIQUE'],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
      {
        name: 'updated_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    indexes: [
      {
        name: 'idx_users_email',
        columns: ['email'],
        unique: true,
      },
    ],
    rowCount: 980,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-c',
    tableName: 'products',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'products_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'name',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'description',
        dataType: 'text',
        nullable: true,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'price',
        dataType: 'numeric(10,2)',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
      {
        name: 'updated_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    indexes: [],
    rowCount: 2100,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-c',
    tableName: 'audit_log',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'audit_log_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'entity_type',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'entity_id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'action',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'changes',
        dataType: 'jsonb',
        nullable: true,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    indexes: [
      {
        name: 'idx_audit_log_entity',
        columns: ['entity_type', 'entity_id'],
        unique: false,
      },
    ],
    rowCount: 98500,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-c',
    tableName: 'notifications',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'notifications_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'user_id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: undefined,
        constraints: ['FOREIGN KEY'],
      },
      {
        name: 'message',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'read',
        dataType: 'boolean',
        nullable: false,
        defaultValue: 'false',
        constraints: [],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      {
        name: 'fk_notifications_user_id',
        columns: ['user_id'],
        referencedTable: 'users',
        referencedColumns: ['id'],
      },
    ],
    indexes: [
      {
        name: 'idx_notifications_user_id',
        columns: ['user_id'],
        unique: false,
      },
    ],
    rowCount: 45600,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
]

// ============================================================================
// PROJECT D: Minimal Schema (Only has core tables)
// ============================================================================

export const PROJECT_D_SCHEMA: TableSchema[] = [
  {
    projectId: 'project-d',
    tableName: 'users',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'users_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'email',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: ['UNIQUE'],
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: false,
        defaultValue: 'now()',
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    indexes: [
      {
        name: 'idx_users_email',
        columns: ['email'],
        unique: true,
      },
    ],
    rowCount: 520,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
  {
    projectId: 'project-d',
    tableName: 'products',
    columns: [
      {
        name: 'id',
        dataType: 'bigint',
        nullable: false,
        defaultValue: 'nextval(\'products_id_seq\'::regclass)',
        constraints: ['PRIMARY KEY'],
      },
      {
        name: 'name',
        dataType: 'text',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
      {
        name: 'price',
        dataType: 'numeric(10,2)',
        nullable: false,
        defaultValue: undefined,
        constraints: [],
      },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    indexes: [],
    rowCount: 1200,
    lastUpdated: new Date('2026-05-21T10:00:00Z'),
  },
]

// ============================================================================
// ALL PROJECTS COMBINED
// ============================================================================

export const ALL_PROJECTS_SCHEMAS = {
  'project-a': PROJECT_A_SCHEMA,
  'project-b': PROJECT_B_SCHEMA,
  'project-c': PROJECT_C_SCHEMA,
  'project-d': PROJECT_D_SCHEMA,
}

export const ALL_PROJECTS = ['project-a', 'project-b', 'project-c', 'project-d']

// ============================================================================
// HELPER FUNCTIONS FOR TESTING
// ============================================================================

export function getAllSchemas() {
  return ALL_PROJECTS_SCHEMAS
}

export function getProjectSchema(projectId: string): TableSchema[] {
  return ALL_PROJECTS_SCHEMAS[projectId as keyof typeof ALL_PROJECTS_SCHEMAS] || []
}

export function getTableSchema(projectId: string, tableName: string): TableSchema | undefined {
  const schema = getProjectSchema(projectId)
  return schema.find((t) => t.tableName === tableName)
}

export function validateSimilarityScore(score: number): boolean {
  return score >= 0 && score <= 100
}

export function validateRecommendation(recommendation: any): boolean {
  return (
    recommendation.type &&
    recommendation.affectedTables &&
    recommendation.recommendation &&
    recommendation.confidence >= 0 &&
    recommendation.confidence <= 1 &&
    ['low', 'medium', 'high'].includes(recommendation.effort)
  )
}

// ============================================================================
// PERFORMANCE TEST DATA
// ============================================================================

export function generateLargeSchema(projectId: string, tableCount: number): TableSchema[] {
  const schemas: TableSchema[] = []

  for (let i = 0; i < tableCount; i++) {
    schemas.push({
      projectId,
      tableName: `table_${i.toString().padStart(4, '0')}`,
      columns: [
        {
          name: 'id',
          dataType: 'bigint',
          nullable: false,
          defaultValue: `nextval('table_${i}_id_seq'::regclass)`,
          constraints: ['PRIMARY KEY'],
        },
        {
          name: 'name',
          dataType: 'text',
          nullable: false,
          defaultValue: undefined,
          constraints: [],
        },
        {
          name: 'created_at',
          dataType: 'timestamp with time zone',
          nullable: false,
          defaultValue: 'now()',
          constraints: [],
        },
        {
          name: 'updated_at',
          dataType: 'timestamp with time zone',
          nullable: false,
          defaultValue: 'now()',
          constraints: [],
        },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      indexes: [
        {
          name: `idx_table_${i}_name`,
          columns: ['name'],
          unique: false,
        },
      ],
      rowCount: Math.floor(Math.random() * 100000),
      lastUpdated: new Date(),
    })
  }

  return schemas
}

// ============================================================================
// EXPORT FOR TESTING
// ============================================================================

export const mockData = {
  projects: ALL_PROJECTS,
  schemas: ALL_PROJECTS_SCHEMAS,
  helpers: {
    getAllSchemas,
    getProjectSchema,
    getTableSchema,
    validateSimilarityScore,
    validateRecommendation,
    generateLargeSchema,
  },
}
