import type { ReactNode } from 'react';
import { MarkFixLogo } from './markfix-logo.js';

export function AuthLayout({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={`auth-layout ${className}`}>
      <section className="auth-story" aria-label="MarkFix 网页协作">
        <MarkFixLogo width={128} height={36} />
        <div className="auth-story-copy">
          <span>MARK IT. FIX IT.</span>
          <h2>
            让每一处反馈，
            <br />
            都有清晰的落点。
          </h2>
          <p>
            从网页上的一个标记，到团队的一次修复。
            <br />
            把问题、上下文与处理进度连接起来。
          </p>
          <div className="auth-story-preview" aria-hidden="true">
            <div className="auth-preview-bar">
              <i />
              <i />
              <i />
              <span>项目概览</span>
            </div>
            <div className="auth-preview-page">
              <span>让想法更进一步</span>
              <div />
              <div />
              <b>
                开始体验 <em>1</em>
              </b>
            </div>
            <div className="auth-preview-comment">
              <b>1</b>
              <div>
                <strong>在这里，让反馈更准确</strong>
                <p>选中元素，留下批注，交给团队修复。</p>
                <small>元素批注 · 页面上下文</small>
              </div>
            </div>
          </div>
        </div>
        <small className="auth-story-footer">网页批注 / 截图标记 / 团队协作</small>
      </section>
      <div className="auth-form-panel">{children}</div>
    </main>
  );
}
