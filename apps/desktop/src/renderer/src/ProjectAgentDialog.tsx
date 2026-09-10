import { useEffect, useState } from 'react';
import type { AgentRepository, WebsiteProject } from '@markfix/contracts';
import {
  Alert,
  AlertDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
    return () => {
      active = false;
    };
  }, [project]);
  return (
    <Dialog open={Boolean(project)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="project-agent-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>绑定项目</DialogTitle>
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
                onClose();
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
