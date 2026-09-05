// Single source of truth for Implementation "Current Stage" values and their
// Go Live / Post Go-Live grouping — shared by the Implementations page (tabs
// + Stage dropdowns) and /api/implementations (server-side tab filtering) so
// neither side can drift from the other or duplicate the stage list.
export const IMPLEMENTATION_STAGES = [
  'Requirements Gathering',
  'System Configuration',
  'Data Migration',
  'Customization',
  'Testing',
  'User Training',
  'Go-Live',
  'Post Go-Live Support',
];

export type ImplementationStageCategory = 'GO_LIVE' | 'POST_GO_LIVE';

// Only "Post Go-Live Support" is a Post Go-Live stage; every other existing
// stage — including a record with no stage set yet — belongs to Go Live.
export const POST_GO_LIVE_STAGES: string[] = ['Post Go-Live Support'];
export const GO_LIVE_STAGES: string[] = IMPLEMENTATION_STAGES.filter(
  (stage) => !POST_GO_LIVE_STAGES.includes(stage)
);

export const IMPLEMENTATION_STAGE_TABS: { value: ImplementationStageCategory; label: string }[] = [
  { value: 'GO_LIVE', label: 'Go Live' },
  { value: 'POST_GO_LIVE', label: 'Post Go Live' },
];
