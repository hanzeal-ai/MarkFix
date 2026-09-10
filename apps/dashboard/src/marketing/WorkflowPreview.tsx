import { ArrowRight, Check, Crosshair, MessageSquareText, MousePointer2 } from '@markfix/ui/icons';

/** An illustrative case, deliberately labelled rather than presented as a live repair. */
export function WorkflowPreview() {
  return (
    <figure className="workflow-preview" aria-label="网页批注与问题交接示意">
      <div className="workflow-topbar">
        <div className="workflow-window-dots">
          <i />
          <i />
          <i />
        </div>
        <span>MarkFix / 产品验收</span>
        <span className="workflow-example-label">示例场景</span>
      </div>
      <div className="workflow-body">
        <div className="workflow-page">
          <div className="workflow-page-nav">
            <strong>
              Forma<span>®</span>
            </strong>
            <span>产品设计 / 项目概览</span>
            <span className="workflow-avatar">F</span>
          </div>
          <div className="workflow-page-heading">
            <span>项目 / 网站改版</span>
            <h3>把好想法，交付成作品。</h3>
            <p>规划、设计、交付。让团队的下一步清晰可见。</p>
          </div>
          <div className="workflow-business-grid">
            <div className="workflow-design-sample">
              <span>WEBSITE REDESIGN</span>
              <div className="workflow-shapes">
                <i />
                <i />
                <i />
              </div>
              <strong>品牌网站改版</strong>
              <span>设计验收 · 进行中</span>
            </div>
            <div className="workflow-task-sample">
              <span>交付检查</span>
              <p>
                <Check size={14} /> 页面内容确认
              </p>
              <p>
                <Check size={14} /> 组件样式检查
              </p>
              <div className="workflow-selected">
                <span>提交审核</span>
                <b>1</b>
                <MousePointer2 />
              </div>
            </div>
          </div>
          <div className="workflow-toolbar">
            <Crosshair size={15} />
            <span>元素批注</span>
            <span>选中页面元素，描述修改建议</span>
          </div>
        </div>
        <aside className="workflow-comment">
          <div className="workflow-comment-heading">
            <MessageSquareText size={16} />
            <strong>网页批注</strong>
            <span>1 条</span>
          </div>
          <div className="workflow-comment-content">
            <span className="workflow-issue-id">#001 · 按钮布局</span>
            <h4>让提交按钮与内容对齐</h4>
            <p>“提交审核”按钮应与上方检查项左侧对齐，保持相同的内容边距。</p>
            <div className="workflow-context">
              <span>关联页面</span>
              <strong>/projects/website</strong>
              <span>标注对象</span>
              <strong>提交审核 · 按钮</strong>
            </div>
            <div className="workflow-repository">
              <span>绑定仓库</span>
              <strong>
                <span /> forma-web
              </strong>
            </div>
          </div>
          <div className="workflow-handoff">
            <span>交给研发或 Codex</span>
            <ArrowRight size={16} />
          </div>
        </aside>
      </div>
      <figcaption>
        <span>
          <span className="workflow-dot" /> 标注位置、修改建议、项目上下文
        </span>
        <span>一次交接，清楚到位。</span>
      </figcaption>
    </figure>
  );
}
