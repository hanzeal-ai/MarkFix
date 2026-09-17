import { diagnosticEvidenceSections, type DiagnosticEvidence } from '@markfix/contracts';
import { Button, DiagnosticDetails } from '@markfix/ui';
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
        <div
          key={item.id}
          className={item.level}
          style={{
            display: 'grid',
            gridTemplateColumns: '16px minmax(0, 1fr) auto',
            gap: 6,
            width: '100%',
            alignItems: 'center',
          }}
        >
          <Paperclip />
          <b>{item.title}</b>
          <Button type="button" title="移除引用" onClick={() => onRemove(item.id)}>
            <X />
          </Button>
          <DiagnosticDetails title="查看引用详情" sections={diagnosticEvidenceSections(item)} />
        </div>
      ))}
    </div>
  );
}
