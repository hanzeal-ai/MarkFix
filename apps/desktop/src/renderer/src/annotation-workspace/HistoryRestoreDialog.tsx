import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@markfix/ui';
import type { ProjectAnnotation } from '../project-navigation/model';

export function HistoryRestoreDialog({
  annotation,
  onCancel,
  onConfirm,
}: {
  annotation: ProjectAnnotation | undefined;
  onCancel: () => void;
  onConfirm: (annotation: ProjectAnnotation) => void;
}) {
  return (
    <AlertDialog open={Boolean(annotation)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃当前编辑内容？</AlertDialogTitle>
          <AlertDialogDescription>
            当前有未保存的编辑内容。恢复历史标注将放弃这些内容，此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => annotation && onConfirm(annotation)}
          >
            放弃并恢复
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
