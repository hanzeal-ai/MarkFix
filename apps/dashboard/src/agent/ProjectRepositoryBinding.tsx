import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RepositoryBinding } from '@markfix/ui';
import type { AgentRepository } from '@markfix/contracts';
import { adminApi } from '../admin/api.js';
export function ProjectRepositoryBinding({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['repository-binding', projectId, canManage],
    queryFn: async () => {
      const [binding, repositories] = await Promise.all([
        adminApi.requestJson<{ repositoryId: string | null; repositoryName: string | null }>(
          `/v1/agent/projects/${projectId}/binding`,
        ),
        canManage
          ? adminApi.requestJson<AgentRepository[]>(`/v1/agent/projects/${projectId}/repositories`)
          : [],
      ]);
      return { binding, repositories };
    },
    retry: false,
  });
  if (query.error) return <p role="alert">无法读取仓库绑定：{query.error.message}</p>;
  if (!query.data) return <p>正在读取仓库绑定…</p>;
  return (
    <RepositoryBinding
      binding={query.data.binding}
      repositories={query.data.repositories}
      readOnly={!canManage}
      onSave={async (binding) => {
        await adminApi.requestJson(`/v1/agent/projects/${projectId}/binding`, {
          method: 'PATCH',
          body: JSON.stringify(binding),
        });
        await queryClient.invalidateQueries({ queryKey: ['repository-binding', projectId] });
      }}
    />
  );
}
