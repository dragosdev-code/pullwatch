export interface PullRequest {
  id: number;
  title: string;
  repository: string;
  author: string;
  updatedAt: string;
  url: string;
  hasUnread: boolean;
  isNew?: boolean;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  phase: 'burst' | 'drift' | 'fade';
  color: string;
  size: number;
  opacity: number;
  centerX: number;
  centerY: number;
  angle: number;
  orbitRadius: number;
}

// Arc's color palette
export const arcColors = [
  '#3B82F6', // Blue
  '#06B6D4', // Cyan
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#F59E0B', // Amber
];
