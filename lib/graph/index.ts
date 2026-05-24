// Prerequisite DAG + frontier recommendation (PLAN.md §5.3).
// PR1 ships interfaces + default parameters only; traversal + tests land in PR4.

export interface ConceptNode {
  id: string
  unitId: string
  prereqIds: string[]
  orderIndex: number
}

export interface FrontierInput {
  concepts: ConceptNode[]
  masteryByConcept: Record<string, number>
  threshold?: number
}

/**
 * Recommend concepts whose prerequisites are all at/above threshold while the
 * concept itself is still below it. Sorted per PLAN.md §5.3.
 */
export type Frontier = (input: FrontierInput) => string[]

export const GRAPH_DEFAULTS = {
  masteryThreshold: 0.7,
} as const
