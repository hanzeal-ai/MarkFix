import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
} from '@markfix/ui';
import { ProjectRepositoryBinding } from '../../agent/ProjectRepositoryBinding';
import { commercialRequest } from '../api';
import type { OverviewProject } from '../model';

export function ProjectSettingsDialog({
  project,
  onClose,
}: {
  project: OverviewProject;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(project.category);
  const queryClient = useQueryClient();
  const updateCategory = useMutation({
    mutationFn: () =>
      commercialRequest(`/projects/${project.id}/category`, {
        method: 'PATCH',
        body: JSON.stringify({ category: category.trim() }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commercial-overview'] }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="project-settings-dialog">
        <DialogHeader>
          <DialogTitle>项目设置</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        <form
          className="category-editor"
          onSubmit={(event) => {
            event.preventDefault();
            updateCategory.mutate();
          }}
        >
          <Label>
            项目分类
            <Input
              aria-label="项目分类"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </Label>
          <Button type="submit" disabled={!category.trim() || updateCategory.isPending}>
            保存分类
          </Button>
        </form>
        {updateCategory.error instanceof Error && (
          <Alert variant="destructive">
            <AlertDescription>{updateCategory.error.message}</AlertDescription>
          </Alert>
        )}
        <section aria-label="绑定项目">
          <h3>绑定项目</h3>
          <ProjectRepositoryBinding projectId={project.id} canManage />
        </section>
      </DialogContent>
    </Dialog>
  );
}
