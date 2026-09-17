export function DiagnosticDetails({
  title,
  sections,
}: {
  title: string;
  sections: ReadonlyArray<{ label: string; value: string }>;
}) {
  return (
    <details
      className="diagnostic-evidence-details"
      style={{ minWidth: 0, width: '100%', marginTop: 8, gridColumn: '1 / -1' }}
    >
      <summary style={{ cursor: 'pointer', overflowWrap: 'anywhere', fontSize: 12 }}>
        {title}
      </summary>
      <dl style={{ display: 'grid', gap: 8, margin: '8px 0', minWidth: 0 }}>
        {sections.map(({ label, value }, index) => (
          <div key={`${label}:${index}`} style={{ minWidth: 0 }}>
            <dt style={{ fontSize: 12, fontWeight: 600 }}>{label}</dt>
            <dd style={{ margin: '4px 0 0' }}>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  maxHeight: 260,
                  overflow: 'auto',
                  margin: 0,
                  padding: 8,
                  borderRadius: 4,
                  background: 'rgba(128,128,128,0.08)',
                  fontSize: 11,
                  userSelect: 'text',
                }}
              >
                {value}
              </pre>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
