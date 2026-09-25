import { useState } from 'react';
import { Button, Textarea } from '@markfix/ui';
import type { Report } from '@markfix/contracts';

export function RepairReviewPanel({
  reports,
  onReviewed,
}: {
  reports: Report[];
  onReviewed: (report: Report) => void;
}) {
  const [busy, setBusy] = useState<string>();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const pending = reports.filter((report) => report.status === 'READY_FOR_VERIFY');
  if (!pending.length) return null;
  async function review(report: Report, action: 'verify' | 'reject') {
    if (busy) return;
    setBusy(report.id);
    setError('');
    try {
      const updated = await window.markfix.reviewAnnotationRepair({
        projectId: report.projectId,
        reportId: report.id,
        expectedVersion: report.version,
        action,
        ...(action === 'reject' ? { reason: reason[report.id] ?? '' } : {}),
      });
      onReviewed(updated);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '复验结果未保存，请重试');
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <section className="capture-notes-list" aria-label="修复复验">
      {pending.map((report) => (
        <article className="capture-note-card" key={report.id}>
          <strong>待复验 · {report.title}</strong>
          <p>{report.fixAttempts?.[0]?.summary ?? '修复已提交，请在目标页面核对效果。'}</p>
          <small>先确认当前页面已更新到修复版本；本状态不代表已上线。</small>
          <Button disabled={Boolean(busy)} onClick={() => void review(report, 'verify')}>
            验证通过
          </Button>
          <details>
            <summary>问题仍然存在</summary>
            <Textarea
              aria-label={`退回原因：${report.title}`}
              maxLength={2000}
              value={reason[report.id] ?? ''}
              onChange={(event) =>
                setReason((previous) => ({ ...previous, [report.id]: event.target.value }))
              }
              placeholder="说明仍然存在的问题"
            />
            <Button
              variant="outline"
              disabled={Boolean(busy) || !reason[report.id]?.trim()}
              onClick={() => void review(report, 'reject')}
            >
              退回修复
            </Button>
          </details>
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
