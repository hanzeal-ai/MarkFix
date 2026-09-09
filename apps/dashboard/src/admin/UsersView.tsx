import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  Input,
  Label,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@markfix/ui';
import { Copy, Plus, Search, Users } from '@markfix/ui/icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import './admin.css';
import { adminApi as api } from './api';
import { EmptyState } from './components/AdminState';
import { type OverviewProject, type OverviewUser } from './model';

export function UsersView({
  users,
  projects,
}: {
  users: OverviewUser[];
  projects: OverviewProject[];
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const selectedProject = projects.find((project) => project.id === projectId);
  const canManage = selectedProject?.role === 'OWNER' || selectedProject?.role === 'ADMIN';
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const invitation = useMutation({
    mutationFn: () => api.createInvitation(projectId, email, role),
    onSuccess: ({ token }) => {
      setInviteUrl(
        `${window.location.origin}/accept-invitation?token=${encodeURIComponent(token)}`,
      );
      setEmail('');
    },
  });
  const normalized = query.trim().toLocaleLowerCase();
  const visibleUsers = users
    .filter((user) => user.projectIds?.includes(projectId))
    .filter(
      (user) =>
        !normalized || `${user.displayName} ${user.email}`.toLocaleLowerCase().includes(normalized),
    );

  return (
    <>
      <div className="users-toolbar">
        <NativeSelect
          aria-label="成员所属项目"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setInviteUrl('');
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </NativeSelect>
        <Label className="admin-search">
          <Search />
          <Input
            placeholder="搜索用户"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Label>
        {canManage && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              invitation.mutate();
            }}
          >
            <NativeSelect
              aria-label="邀请角色"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="MEMBER">开发成员</option>
              <option value="REPORTER">反馈成员</option>
              <option value="ADMIN">项目管理员</option>
            </NativeSelect>
            <Input
              aria-label="邀请邮箱"
              placeholder="输入邮箱邀请成员"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" disabled={invitation.isPending}>
              <Plus />
              {invitation.isPending ? '正在创建…' : '邀请成员'}
            </Button>
          </form>
        )}
      </div>
      {invitation.error instanceof Error && (
        <Alert variant="destructive">
          <AlertDescription>{invitation.error.message}</AlertDescription>
        </Alert>
      )}
      {inviteUrl && (
        <Alert className="invitation-result">
          <AlertDescription>
            <strong>邀请已创建</strong>
            <span>复制链接发送给成员。</span>
            <span className="invitation-link">
              <Input readOnly value={inviteUrl} />
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true));
                }}
              >
                <Copy />
                {copied ? '已复制' : '复制'}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}
      <Card className="users-card">
        <Table className="users-table">
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>项目角色</TableHead>
              <TableHead>项目分类</TableHead>
              <TableHead>标注</TableHead>
              <TableHead>驳回</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="user-identity">
                    <Avatar>
                      <AvatarFallback>{user.displayName.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span>
                      <strong>{user.displayName}</strong>
                      <small>{user.email}</small>
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span>
                    {
                      (
                        {
                          OWNER: '所有者',
                          ADMIN: '管理员',
                          MEMBER: '开发成员',
                          REPORTER: '反馈成员',
                        } as Record<string, string>
                      )[user.projectRoles[projectId] ?? '']
                    }
                  </span>
                </TableCell>
                <TableCell>
                  <span className="category-badges">
                    {user.projectCategories.length ? (
                      user.projectCategories.map((item) => (
                        <Badge variant="secondary" key={item.category}>
                          {item.category}
                        </Badge>
                      ))
                    ) : (
                      <small>暂无分类</small>
                    )}
                  </span>
                </TableCell>
                <TableCell>{user.annotationCount}</TableCell>
                <TableCell className={user.rejectedCount ? 'rejected-number' : ''}>
                  {user.rejectedCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>{' '}
      </Card>
      {!visibleUsers.length && <EmptyState icon={Users} title="没有找到用户" />}
    </>
  );
}
