import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  Progress,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@markfix/ui';
import {
  ChevronRight,
  CircleDot,
  Clock3,
  FolderKanban,
  MessageSquareText,
} from '@markfix/ui/icons';
import { type ComponentType, type CSSProperties } from 'react';
import './admin.css';
import { EmptyState } from './components/AdminState';
import { projectProgress, type CommercialOverview, type OverviewProject } from './model';

import { ProjectLogo } from './components/ProjectLogo';
function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <Card className={`metric-card ${tone ?? ''}`}>
      <div className="metric-icon">
        <Icon />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}

export function OverviewView({
  overview,
  onProject,
}: {
  overview: CommercialOverview;
  onProject: (project: OverviewProject) => void;
}) {
  const total = overview.metrics.annotations;
  const resolved = overview.projects.reduce((sum, project) => sum + project.resolvedCount, 0);
  const pendingShare = total ? (overview.metrics.pending / total) * 100 : 0;
  const resolvedShare = total ? (resolved / total) * 100 : 0;
  const pendingPercent = Math.round(pendingShare);
  const resolvedPercent = Math.round(resolvedShare);
  const rejectedPercent = total ? Math.round((overview.metrics.rejected / total) * 100) : 0;
  const donutStyle = {
    background: total
      ? `conic-gradient(#e2a33b 0 ${pendingShare}%, var(--primary) ${pendingShare}% ${
          pendingShare + resolvedShare
        }%, #d46055 ${pendingShare + resolvedShare}% 100%)`
      : '#ececf1',
  } satisfies CSSProperties;
  const chartProjects = [...overview.projects]
    .sort((left, right) => right.annotationCount - left.annotationCount)
    .slice(0, 6);

  return (
    <>
      <section className="metrics-grid">
        <MetricCard icon={FolderKanban} label="标注项目" value={overview.metrics.projects} />
        <MetricCard
          icon={MessageSquareText}
          label="全部标注"
          value={overview.metrics.annotations}
        />
        <MetricCard icon={Clock3} label="待处理" value={overview.metrics.pending} tone="warning" />
        <MetricCard
          icon={CircleDot}
          label="已驳回"
          value={overview.metrics.rejected}
          tone="danger"
        />
      </section>

      <section className="overview-charts">
        <Card className="chart-card status-chart">
          <div className="chart-card-header">
            <strong>处理状态</strong>
          </div>
          <div className="status-chart-body">
            <div className="status-donut" style={donutStyle}>
              <span>
                <strong>{total}</strong>
                <small>全部标注</small>
              </span>
            </div>
            <ul className="chart-legend">
              <li>
                <i className="pending" />
                <span>待处理</span>
                <strong>{overview.metrics.pending}</strong>
                <small>{pendingPercent}%</small>
              </li>
              <li>
                <i className="resolved" />
                <span>已解决</span>
                <strong>{resolved}</strong>
                <small>{resolvedPercent}%</small>
              </li>
              <li>
                <i className="rejected" />
                <span>已驳回</span>
                <strong>{overview.metrics.rejected}</strong>
                <small>{rejectedPercent}%</small>
              </li>
            </ul>
          </div>
        </Card>

        <Card className="chart-card project-chart-card">
          <div className="chart-card-header">
            <strong>项目标注量</strong>
            <div className="compact-legend" aria-label="图表图例">
              <span>
                <i className="pending" />
                待处理
              </span>
              <span>
                <i className="resolved" />
                已解决
              </span>
              <span>
                <i className="rejected" />
                已驳回
              </span>
            </div>
          </div>
          <div className="project-bars">
            {chartProjects.map((project) => {
              const divisor = project.annotationCount || 1;
              return (
                <Button
                  type="button"
                  variant="ghost"
                  key={project.id}
                  onClick={() => onProject(project)}
                >
                  <span title={project.name}>{project.name}</span>
                  <span
                    className="stacked-bar"
                    aria-label={`${project.name} ${project.annotationCount} 条标注`}
                  >
                    <i
                      className="pending"
                      style={{ width: `${(project.pendingCount / divisor) * 100}%` }}
                    />
                    <i
                      className="resolved"
                      style={{ width: `${(project.resolvedCount / divisor) * 100}%` }}
                    />
                    <i
                      className="rejected"
                      style={{ width: `${(project.rejectedCount / divisor) * 100}%` }}
                    />
                  </span>
                  <strong>{project.annotationCount}</strong>
                </Button>
              );
            })}
            {!chartProjects.length && <EmptyState icon={FolderKanban} title="暂无项目数据" />}
          </div>
        </Card>
      </section>

      <Card className="dimension-card">
        <Tabs defaultValue="project">
          <div className="dimension-header">
            <div>
              <strong>标注分布</strong>
            </div>
            <TabsList>
              <TabsTrigger value="project">按项目</TabsTrigger>
              <TabsTrigger value="user">按用户</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="project" className="dimension-list">
            {overview.projects.map((project) => (
              <Button
                type="button"
                variant="ghost"
                className="dimension-row"
                key={project.id}
                onClick={() => onProject(project)}
              >
                <ProjectLogo project={project} />
                <span className="dimension-main">
                  <strong>{project.name}</strong>
                  <small>{project.category}</small>
                </span>
                <span className="dimension-stat">
                  <strong>{project.annotationCount}</strong>
                  <small>标注</small>
                </span>
                <span className="dimension-stat">
                  <strong>{project.pendingCount}</strong>
                  <small>待处理</small>
                </span>
                <span className="dimension-stat is-rejected">
                  <strong>{project.rejectedCount}</strong>
                  <small>已驳回</small>
                </span>
                <span className="progress-cell">
                  <Progress value={projectProgress(project)} aria-label="解决进度" />
                  <small>{projectProgress(project)}%</small>
                </span>
                <ChevronRight />
              </Button>
            ))}
          </TabsContent>
          <TabsContent value="user" className="dimension-list">
            {overview.users.map((user) => (
              <div className="dimension-row user-dimension-row" key={user.id}>
                <Avatar className="user-symbol">
                  <AvatarFallback className="bg-transparent text-inherit">
                    {user.displayName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="dimension-main">
                  <strong>{user.displayName}</strong>
                  <small>{user.email}</small>
                </span>
                <span className="category-badges">
                  {user.projectCategories.length ? (
                    user.projectCategories.map((item) => (
                      <Badge variant="secondary" key={item.category}>
                        {item.category} · {item.count}
                      </Badge>
                    ))
                  ) : (
                    <small>暂无项目分类</small>
                  )}
                </span>
                <span className="dimension-stat">
                  <strong>{user.annotationCount}</strong>
                  <small>提交标注</small>
                </span>
                <span className="dimension-stat is-rejected">
                  <strong>{user.rejectedCount}</strong>
                  <small>被驳回</small>
                </span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}
