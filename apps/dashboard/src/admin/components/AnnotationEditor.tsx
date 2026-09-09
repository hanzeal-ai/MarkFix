import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { ScreenshotPreviewDialog } from './ScreenshotPreviewDialog';
import {
  formatDate,
  kindText,
  statusText,
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
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setTitle(annotation?.title ?? '');
    setNote(annotation?.note ?? '');
    setKind(annotation?.kind ?? 'ELEMENT');
    setPageUrl(annotation?.pageUrl ?? project.baseUrl ?? 'https://');
    setAuthorId(annotation?.authorId ?? '');
    setStatus(annotation?.status === 'REJECTED' ? 'OPEN' : (annotation?.status ?? 'OPEN'));
    setReason(annotation?.rejectionReason ?? '');
    setScreenshotPreviewUrl(null);
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
            <div className="annotation-detail-badges">
              <Badge variant="outline">{state.annotation.referenceCode}</Badge>
              <StatusBadge status={state.annotation.status} />
              <Badge variant="secondary">{kindText[state.annotation.kind]}</Badge>
            </div>
            {state.annotation.screenshotUrl && (
              <section className="annotation-detail-section">
                <Button
                  className="annotation-screenshot-button"
                  variant="ghost"
                  type="button"
                  onClick={() => setScreenshotPreviewUrl(state.annotation.screenshotUrl)}
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
            <section className="annotation-detail-section annotation-history-section">
              <h4>历史信息</h4>
              <ol className="annotation-history-list">
                {state.annotation.history.map((item) => (
                  <li key={item.id}>
                    <span
                      className={`annotation-history-dot status-${item.status.toLowerCase()}`}
                    />
                    <div>
                      <div className="annotation-history-heading">
                        <strong>
                          {item.action === 'SUBMITTED'
                            ? '已提交'
                            : item.action === 'REJECTED'
                              ? '已驳回'
                              : item.action === 'RESUBMITTED'
                                ? '已重新提交'
                                : '状态更新'}
                        </strong>
                        {item.status !== 'OPEN' && (
                          <Badge
                            className={`annotation-status status-${item.status.toLowerCase()}`}
                          >
                            {statusText[item.status]}
                          </Badge>
                        )}
                        <time>{formatDate(item.createdAt)}</time>
                      </div>
                      {item.actor && <small>操作人：{item.actor.displayName}</small>}
                      {(item.screenshotUrl || item.note) && (
                        <div className="annotation-history-content">
                          {item.screenshotUrl && (
                            <Button
                              className="annotation-history-thumbnail"
                              variant="ghost"
                              type="button"
                              aria-label={`预览${item.action === 'SUBMITTED' ? '原始' : '重新提交'}截图`}
                              onClick={() => setScreenshotPreviewUrl(item.screenshotUrl)}
                            >
                              <img
                                src={resolveAdminAssetUrl(item.screenshotUrl)}
                                alt="历史截图缩略图"
                                loading="lazy"
                              />
                            </Button>
                          )}
                          {item.note && <p className="annotation-history-note">{item.note}</p>}
                        </div>
                      )}
                      {item.reason && <p>原因：{item.reason}</p>}
                    </div>
                  </li>
                ))}
              </ol>
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
                  onClick={() => setScreenshotPreviewUrl(annotation.screenshotUrl)}
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
        {annotation && screenshotPreviewUrl && (
          <ScreenshotPreviewDialog
            title={annotation.title}
            url={screenshotPreviewUrl}
            onClose={() => setScreenshotPreviewUrl(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
