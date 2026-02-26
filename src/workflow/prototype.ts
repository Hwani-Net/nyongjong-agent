// Workflow stage 2: Prototype — generate code + design simultaneously
import { createLogger } from '../utils/logger.js';

const log = createLogger('workflow:prototype');

export interface PrototypeInput {
  /** Goal analysis from Understand stage */
  analysis: {
    taskType: string;
    complexity: string;
    scope: string;
    keyRequirements: string[];
  };
  /** Original user goal */
  goal: string;
  /** Persona consultation results (if any) */
  personaFeedback?: string[];
  /** Project root path (for file operations) */
  projectRoot?: string;
}

export interface PrototypePlan {
  /** Files that need to be created or modified */
  filePlan: FilePlanEntry[];
  /** Commands to run (build, install, etc.) */
  commands: string[];
  /** Architecture notes */
  notes: string;
  /** Estimated effort description */
  effort: string;
}

export interface FilePlanEntry {
  path: string;
  action: 'create' | 'modify' | 'delete';
  description: string;
  /** Priority order (lower = first) */
  order: number;
}

/**
 * Stage 2: Prototype — plan the implementation.
 *
 * In the AI circular workflow, prototyping and design happen simultaneously.
 * This function creates a structured plan that the execution modules will follow.
 */
export function createPrototypePlan(input: PrototypeInput): PrototypePlan {
  const { analysis, goal, personaFeedback } = input;
  log.info('Creating prototype plan', { taskType: analysis.taskType });

  const filePlan: FilePlanEntry[] = [];
  const commands: string[] = [];
  const noteParts: string[] = [];

  // Incorporate persona feedback
  if (personaFeedback && personaFeedback.length > 0) {
    noteParts.push('## Persona Insights');
    personaFeedback.forEach((fb, i) => {
      noteParts.push(`${i + 1}. ${fb.slice(0, 200)}`);
    });
  }

  // Generate file plan based on task type
  if (analysis.keyRequirements.includes('UI/UX 구현 필요')) {
    filePlan.push(
      { path: 'src/components/', action: 'create', description: 'UI components', order: 2 },
      { path: 'src/styles/', action: 'create', description: 'Styles and themes', order: 1 },
    );
    commands.push('npm run build');
  }

  if (analysis.keyRequirements.includes('API 엔드포인트 구현 필요')) {
    filePlan.push(
      { path: 'src/api/', action: 'create', description: 'API route handlers', order: 1 },
      { path: 'src/lib/', action: 'create', description: 'Business logic', order: 0 },
    );
  }

  if (analysis.keyRequirements.includes('새 기능 구현')) {
    filePlan.push(
      { path: 'src/', action: 'create', description: 'Main implementation files', order: 0 },
    );
    commands.push('npm run typecheck');
  }

  // Always add test files
  filePlan.push(
    { path: 'tests/', action: 'create', description: 'Test files for new code', order: 10 },
  );
  commands.push('npm test');

  // Sort by order
  filePlan.sort((a, b) => a.order - b.order);

  // Estimate effort
  const effort = analysis.complexity === 'critical' ? '4+ hours'
    : analysis.complexity === 'high' ? '2-4 hours'
    : analysis.complexity === 'medium' ? '1-2 hours'
    : '< 1 hour';

  noteParts.push(`\n## Plan Summary`);
  noteParts.push(`- Task: ${goal.slice(0, 100)}`);
  noteParts.push(`- Type: ${analysis.taskType}`);
  noteParts.push(`- Files: ${filePlan.length}`);
  noteParts.push(`- Effort: ${effort}`);

  log.info(`Prototype plan created: ${filePlan.length} files, ${commands.length} commands`);

  return {
    filePlan,
    commands,
    notes: noteParts.join('\n'),
    effort,
  };
}
