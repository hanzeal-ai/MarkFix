import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@markfix/ui';
import { ChevronRight, FolderKanban, Search, Settings2 } from '@markfix/ui/icons';
import { useState } from 'react';
import './admin.css';
import { EmptyState } from './components/AdminState';
import { projectProgress, statusText, type OverviewProject } from './model';

import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
import { ProjectLogo } from './components/ProjectLogo';
export function ProjectsView({
  projects,
  onProject,
}: {
  projects: OverviewProject[];
  onProject: (project: OverviewProject) => void;
}) {
  const [settingsProjectId, setSettingsProjectId] = useState<string>();
  const settingsProject = projects.find(({ id }) => id === settingsProjectId);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const categories = [...new Set(projects.map((project) => project.category))];
  const visible = projects.filter(
    (project) =>
      (category === 'ALL' || project.category === category) &&
      (!query.trim() ||
        `${project.name} ${project.baseUrl ?? ''}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())),
  );
  return (
    <>
      <div className="project-toolbar">
        <Label className="admin-search">
          <Search />
          <Input
            placeholder="搜索项目"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Label>
        <div className="filter-control">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="项目分类筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部分类</SelectItem>
              {categories.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <section className="projects-grid">
        {visible.map((project) => (
          <Card className="project-card" key={project.id}>
            {(project.role === 'OWNER' || project.role === 'ADMIN') && (
              <Button
                className="project-card-settings"
                variant="ghost"
                size="icon-sm"
                title="项目设置"
                aria-label={`设置${project.name}`}
                onClick={() => setSettingsProjectId(project.id)}
              >
                <Settings2 />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="project-card-open"
              onClick={() => onProject(project)}
            >
              <div className="project-card-top">
                <ProjectLogo project={project} />
                <Badge variant="secondary">{project.category}</Badge>
                <ChevronRight className="project-card-chevron" />
              </div>
              <h3>{project.name}</h3>
              <p>{project.baseUrl ?? '尚未设置项目地址'}</p>
              <div className="project-card-stats">
                <span>
                  <strong>{project.annotationCount}</strong>全部标注
                </span>
                <span className="status-open">
                  <strong>{project.pendingCount}</strong>
                  {statusText.OPEN}
                </span>
                <span className="status-rejected">
                  <strong>{project.rejectedCount}</strong>
                  {statusText.REJECTED}
                </span>
                <span className="status-resolved">
                  <strong>{project.resolvedCount}</strong>
                  {statusText.RESOLVED}
                </span>
                <span className="status-fix_failed">
                  <strong>{project.failedCount}</strong>
                  {statusText.FIX_FAILED}
                </span>
                <span>
                  <strong>{project.memberCount}</strong>协作成员
                </span>
              </div>
              <div className="project-progress">
                <div>
                  <span>解决进度</span>
                  <strong>{projectProgress(project)}%</strong>
                </div>
                <Progress value={projectProgress(project)} aria-label="解决进度" />
              </div>
            </Button>
          </Card>
        ))}
      </section>
      {settingsProject &&
        (settingsProject.role === 'OWNER' || settingsProject.role === 'ADMIN') && (
          <ProjectSettingsDialog
            key={settingsProject.id}
            project={settingsProject}
            onClose={() => setSettingsProjectId(undefined)}
          />
        )}
      {!visible.length && <EmptyState icon={FolderKanban} title="没有找到项目" />}
    </>
  );
}
