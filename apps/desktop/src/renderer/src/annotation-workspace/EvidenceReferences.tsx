import type { DiagnosticEvidence } from '@markfix/contracts';
import { Button } from '@markfix/ui';
import { Paperclip, X } from '@markfix/ui/icons';

export function EvidenceReferences({
  items,
  onRemove,
}: {
  items: DiagnosticEvidence[];
  onRemove: (id: string) => void;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="evidence-references" aria-label="已引用的调试证据">
      {items.map((item) => (
        <span key={item.id} className={item.level}>
          <Paperclip />
          <b>{item.title}</b>
          <Button type="button" title="移除引用" onClick={() => onRemove(item.id)}><X /></Button>
        </span>
      ))}
    </div>
  );
}
