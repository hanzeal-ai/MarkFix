import type { WebsiteProject } from '@markfix/contracts';
import { AlertCircle, LoaderCircle, RefreshCw } from '@markfix/ui/icons';
import { Button } from '@markfix/ui';
import type { BrowserState } from './model';

export function ProjectLoadState({
  browserState,
  project,
  onChangeUrl,
  onRetry,
}: {
  browserState: BrowserState;
  project: WebsiteProject;
  onChangeUrl: () => void;
  onRetry: () => void;
}) {
  return (
    <main
      className="project-loading-page"
      role={browserState.loadFailure ? 'alert' : 'status'}
      aria-live="polite"
      aria-label={browserState.loadFailure ? '项目加载失败' : '正在加载项目'}
    >
      {browserState.loadFailure ? (
        <section className="project-load-failure">
          <span className="project-load-failure-icon" aria-hidden="true">
            <AlertCircle />
          </span>
          <h1>无法访问此网站</h1>
          <p>{browserState.loadFailure.message}</p>
          <small>{browserState.loadFailure.description.replace(/^net::/, '')}</small>
          <div className="project-load-failure-actions">
            <Button type="button" onClick={onRetry}>
              <RefreshCw /> 重新加载
            </Button>
            <Button type="button" variant="outline" onClick={onChangeUrl}>
              更换网址
            </Button>
          </div>
        </section>
      ) : (
        <section className="project-load-progress">
          <LoaderCircle className="spin" />
          <strong>正在加载“{project.title}”</strong>
          <span>{project.currentUrl}</span>
        </section>
      )}
    </main>
  );
}
