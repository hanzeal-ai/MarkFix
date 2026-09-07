import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from '@markfix/ui/icons';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@markfix/ui';
import { commercialRequest, resolveAdminAssetUrl } from '../api';
import { StatusBadge } from './AdminState';
import {
  formatDate,
  kindText,
  type AnnotationKind,
  type AnnotationStatus,
  type EditorState,
  type OverviewProject,
  type OverviewUser,
} from '../model';

const currentUserOption = '__CURRENT_USER__';

export function AnnotationEditor({
  state,
  project,
  users,
  onClose,
}: {
  state: EditorState | null;
  project: OverviewProject;
  users: OverviewUser[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const annotation = state?.annotation;
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<AnnotationKind>('ELEMENT');
  const [pageUrl, setPageUrl] = useState(project.baseUrl ?? 'https://');
  const [authorId, setAuthorId] = useState('');
  const [status, setStatus] = useState<Exclude<AnnotationStatus, 'REJECTED'>>('OPEN');
  const [reason, setReason] = useState('');
  const [screenshotPreviewOpen, setScreenshotPreviewOpen] = useState(false);

  useEffect(() => {
    setTitle(annotation?.title ?? '');
    setNote(annotation?.note ?? '');
    setKind(annotation?.kind ?? 'ELEMENT');
    setPageUrl(annotation?.pageUrl ?? project.baseUrl ?? 'https://');
    setAuthorId(annotation?.authorId ?? '');
    setStatus(annotation?.status === 'REJECTED' ? 'OPEN' : (annotation?.status ?? 'OPEN'));
    setReason(annotation?.rejectionReason ?? '');
    setScreenshotPreviewOpen(false);
  }, [annotation, project.baseUrl, state?.mode]);

  const save = useMutation({
    mutationFn: async () => {
      if (!state) return;
      if (state.mode === 'reject') {
        return commercialRequest(`/annotations/${state.annotation.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      }
      const payload = {
        title,
        note,
        kind,
        pageUrl,
        ...(authorId ? { authorId } : {}),
        ...(state.mode === 'edit' ? { status } : {}),
      };
      if (state.mode === 'create') {
        return commercialRequest(`/projects/${project.id}/annotations`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      return commercialRequest(`/annotations/${state.annotation.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-overview', project.workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['commercial-reports', project.id] }),
      ]);
      onClose();
    },
  });

  if (!state) return null;
  const readOnly = state.mode === 'view';
  const rejecting = state.mode === 'reject';
  const dialogTitle =
    state.mode === 'create'
      ? '新增标注'
      : state.mode === 'edit'
        ? '编辑标注'
        : rejecting
          ? '驳回标注'
          : '标注详情';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="annotation-dialog">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {rejecting
              ? '说明驳回原因，提交人将在记录中看到这条说明。'
              : `${project.name} · ${project.category}`}
          </DialogDescription>
        </DialogHeader>
        {readOnly ? (
          <div className="annotation-detail-grid">
            <div className="annotation-detail-title">
              <div className="annotation-detail-badges">
                <StatusBadge status={state.annotation.status} />
                <Badge variant="secondary">{kindText[state.annotation.kind]}</Badge>
              </div>
              <h3>{state.annotation.title}</h3>
            </div>
            {state.annotation.screenshotUrl && (
              <section className="annotation-detail-section annotation-screenshot-section">
                <Button
                  className="annotation-screenshot-button"
                  variant="ghost"
                  type="button"
                  onClick={() => setScreenshotPreviewOpen(true)}
                  aria-label="预览完整截图"
                >
                  <img
                    src={resolveAdminAssetUrl(state.annotation.screenshotUrl)}
                    alt={`${state.annotation.title}截图`}
                  />
                  <span>点击查看大图</span>
                </Button>
                <div className="annotation-screenshot-note">
                  <p className="annotation-detail-note">{state.annotation.note}</p>
                </div>
              </section>
            )}
            {!state.annotation.screenshotUrl && (
              <section className="annotation-detail-section">
                <h4>标注内容</h4>
                <p className="annotation-detail-note">{state.annotation.note}</p>
              </section>
            )}
            <section className="annotation-detail-section">
              <h4>定位信息</h4>
              <a href={state.annotation.pageUrl} target="_blank" rel="noreferrer">
                {state.annotation.pageUrl}
                <ExternalLink />
              </a>
            </section>
            <section className="annotation-detail-section">
              <h4>记录信息</h4>
              <dl>
                <div>
                  <dt>项目</dt>
                  <dd>{project.name}</dd>
                </div>
                <div>
                  <dt>项目分类</dt>
                  <dd>{project.category}</dd>
                </div>
                <div>
                  <dt>提交人</dt>
                  <dd>
                    {state.annotation.author?.displayName ?? '未知成员'}
                    {state.annotation.author?.email && (
                      <small>{state.annotation.author.email}</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatDate(state.annotation.createdAt)}</dd>
                </div>
                <div>
                  <dt>更新时间</dt>
                  <dd>{formatDate(state.annotation.updatedAt)}</dd>
                </div>
              </dl>
            </section>
            {state.annotation.rejectionReason && (
              <section className="annotation-detail-section rejection-detail">
                <h4>驳回原因</h4>
                <p>{state.annotation.rejectionReason}</p>
              </section>
            )}
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        ) : (
          <form
            className="annotation-form"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {annotation?.screenshotUrl && (
              <section className="annotation-form-screenshot">
                <Button
                  className="annotation-screenshot-button annotation-screenshot-button-compact"
                  variant="ghost"
                  type="button"
                  onClick={() => setScreenshotPreviewOpen(true)}
                  aria-label="预览完整截图"
                >
                  <img
                    src={resolveAdminAssetUrl(annotation.screenshotUrl)}
                    alt={`${annotation.title}截图`}
                  />
                  <span>点击查看大图</span>
                </Button>
              </section>
            )}
            {rejecting ? (
              <Label>
                驳回原因
                <Textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="说明为什么暂不采纳这条标注"
                />
              </Label>
            ) : (
              <>
                <Label>
                  标注标题
                  <Input
                    required
                    maxLength={160}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="简要说明页面问题"
                  />
                </Label>
                <Label>
                  详细说明
                  <Textarea
                    required
                    maxLength={4000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="补充预期结果或处理建议"
                  />
                </Label>
                <div className="annotation-form-row">
                  <Label>
                    标注类型
                    <Select
                      value={kind}
                      onValueChange={(value) => setKind(value as AnnotationKind)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(kindText).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Label>
                  <Label>
                    提交人
                    <Select
                      value={authorId || currentUserOption}
                      onValueChange={(value) =>
                        setAuthorId(value === currentUserOption ? '' : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={currentUserOption}>当前用户</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Label>
                </div>
                {state.mode === 'edit' && (
                  <Label>
                    处理状态
                    <Select
                      value={status}
                      onValueChange={(value) =>
                        setStatus(value as Exclude<AnnotationStatus, 'REJECTED'>)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">待处理</SelectItem>
                        <SelectItem value="IN_REVIEW">处理中</SelectItem>
                        <SelectItem value="RESOLVED">已解决</SelectItem>
                      </SelectContent>
                    </Select>
                  </Label>
                )}
                <Label>
                  页面地址
                  <Input
                    required
                    type="url"
                    value={pageUrl}
                    onChange={(event) => setPageUrl(event.target.value)}
                  />
                </Label>
              </>
            )}
            {save.error instanceof Error && (
              <Alert variant="destructive">
                <AlertDescription>{save.error.message}</AlertDescription>
              </Alert>
            )}
            <div className="dialog-actions">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                type="submit"
                variant={rejecting ? 'destructive' : 'default'}
                disabled={save.isPending}
              >
                {save.isPending ? '正在保存…' : rejecting ? '确认驳回' : '保存标注'}
              </Button>
            </div>
          </form>
        )}
        {annotation?.screenshotUrl && (
          <Dialog open={screenshotPreviewOpen} onOpenChange={setScreenshotPreviewOpen}>
            <DialogContent className="annotation-image-preview-dialog">
              <DialogHeader>
                <DialogTitle>截图预览</DialogTitle>
                <DialogDescription>{annotation.title}</DialogDescription>
              </DialogHeader>
              <div className="annotation-image-preview-canvas">
                <img
                  src={resolveAdminAssetUrl(annotation.screenshotUrl)}
                  alt={`${annotation.title}完整截图`}
                />
              </div>
              <Button variant="outline" onClick={() => setScreenshotPreviewOpen(false)}>
                关闭预览
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
