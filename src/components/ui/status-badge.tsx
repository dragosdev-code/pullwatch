import clsx from 'clsx';
import { XIcon, CheckIcon, ClockIcon, CommentIcon, PullRequestDraftIcon } from './icons';

type ReviewStatus = 'changes_requested' | 'approved' | 'pending' | 'commented' | 'draft';

interface StatusConfig {
  icon: React.ComponentType<{ className?: string; width?: number; height?: number }>;
  label: string;
  classes: string;
}

const STATUS_CONFIG: Record<ReviewStatus, StatusConfig> = {
  changes_requested: {
    icon: XIcon,
    label: 'Changes',
    classes: 'bg-error/15 text-error contrast-80',
  },
  approved: {
    icon: CheckIcon,
    label: 'Approved',
    classes: 'bg-success/15 text-success contrast-80',
  },
  pending: {
    icon: ClockIcon,
    label: 'Pending',
    classes: 'bg-warning/15 text-warning contrast-80',
  },
  commented: {
    icon: CommentIcon,
    label: 'Commented',
    classes: 'bg-info/15 text-info contrast-80',
  },
  draft: {
    icon: PullRequestDraftIcon,
    label: 'Draft',
    classes: 'bg-neutral/15 text-neutral/90 contrast-0',
  },
};

interface StatusBadgeProps {
  status: ReviewStatus;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors duration-150',
        config.classes,
        className
      )}
    >
      <Icon width={10} height={10} className="flex-shrink-0" />
      {config.label}
    </span>
  );
};
