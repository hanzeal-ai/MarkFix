import { useEffect, useState } from 'react';
import type { AgentRepository, Report, WebsiteProject } from '@markfix/contracts';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  RepositoryBinding,
} from '@markfix/ui';
export function ProjectAgentDialog({
  project,
  onClose,
}: {
  project: WebsiteProject | undefined;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    binding: { repositoryId: string | null; repositoryName: string | null };
    repositories: AgentRepository[];
    reports: Report[];
    canManage: boolean;
  }>();
  const [error, setError] = useState('');
  useEffect(() => {
    setData(undefined);
    setError('');
    if (!project) return;
    let active = true;
    const refresh = () =>
      void window.markfix
        .getProjectAgentData(project.id)
        .then((value) => {
          if (active) {
            setData(value);
            setError('');
          }
        })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : '无法读取项目接入信息');
        });
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [project]);
  return (
    <Dialog open={Boolean(project)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="project-agent-dialog">
        <DialogHeader>
          <DialogTitle>{project?.title} · Agent 接入</DialogTitle>
          <DialogDescription>绑定代码仓库，查看标注修复结果。</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!data && !error && <p>正在读取…</p>}
        {data && project && (
          <>
            <RepositoryBinding
              binding={data.binding}
              repositories={data.repositories}
              readOnly={!data.canManage}
              onSave={async (binding) => {
                await window.markfix.setProjectRepository(project.id, binding);
                setData(await window.markfix.getProjectAgentData(project.id));
              }}
            />
            {project.storageMode === 'LOCAL' ? (
              <p>本地项目仅保存仓库名称；CLI 处理已提交到服务器的云端标注。</p>
            ) : (
              <section>
                <h3>标注修复</h3>
                {!data.reports.length && <p>暂无已提交的标注。</p>}
                {data.reports.map((report) => (
                  <article key={report.id} className="agent-report-row">
                    <strong>{report.title}</strong>
                    <span>
                      {report.status === 'FIX_FAILED'
                        ? '修复失败'
                        : ['RESOLVED', 'CLOSED'].includes(report.status) && !report.rejectionReason
                          ? '修复完成'
                          : report.status === 'IN_PROGRESS'
                            ? '修复中'
                            : report.rejectionReason
                              ? '已驳回'
                              : '待修复'}
                    </span>
                    {report.fixAttempts?.map((run) => (
                      <p key={run.id}>
                        {run.status === 'FAILED' ? '失败原因：' : ''}
                        {run.reason ?? run.summary}
                      </p>
                    ))}
                  </article>
                ))}
              </section>
            )}
          </>
        )}
        <Button variant="outline" onClick={onClose}>
          关闭
        </Button>
      </DialogContent>
    </Dialog>
  );
}
