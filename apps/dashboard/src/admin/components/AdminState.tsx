import { Badge } from '@markfix/ui';
import type { CircleDot } from '@markfix/ui/icons';
import { statusText, type AnnotationStatus } from '../model';

export function StatusBadge({ status }: { status: AnnotationStatus }) {
  return (
    <Badge className={`annotation-status status-${status.toLowerCase()}`}>
      {statusText[status]}
    </Badge>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CircleDot;
  title: string;
  description?: string;
}) {
  return (
    <div className="admin-empty">
      <Icon />
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}
