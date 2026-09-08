import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@markfix/ui';
import type { WebsiteProject } from '@markfix/contracts';

export function DeleteProjectDialog({
  project,
  busy,
  onCancel,
  onConfirm,
}: {
  project: WebsiteProject | undefined;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (project: WebsiteProject) => void;
}) {
  return (
    <AlertDialog open={Boolean(project)} onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent onEscapeKeyDown={(event) => busy && event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>确定删除“{project?.title}”吗？</AlertDialogTitle>
          <AlertDialogDescription>
            {project?.storageMode === 'CLOUD'
              ? '该云端项目及报告、标注和浏览历史将被永久删除，无法撤销。'
              : '该本地项目及标注和浏览历史将从本机永久删除，无法撤销。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => project && onConfirm(project)}
          >
            {busy ? '正在删除…' : '删除项目'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
