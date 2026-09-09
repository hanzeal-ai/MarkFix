import { useEffect, useState } from 'react';
import { Button } from './button.js';
import { Input } from './input.js';
import { Label } from './label.js';
import { NativeSelect } from './native-select.js';
export type RepositoryOption = { id: string; name: string; deviceName: string };
export function RepositoryBinding({
  binding,
  repositories,
  onSave,
  readOnly = false,
}: {
  binding: { repositoryId: string | null; repositoryName: string | null };
  repositories: RepositoryOption[];
  onSave: (binding: {
    repositoryId: string | null;
    repositoryName: string | null;
  }) => Promise<void>;
  readOnly?: boolean;
}) {
  const [id, setId] = useState(binding.repositoryId ?? '');
  const [name, setName] = useState(binding.repositoryName ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setId(binding.repositoryId ?? '');
    setName(binding.repositoryName ?? '');
  }, [binding.repositoryId, binding.repositoryName]);
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await onSave({ repositoryId: id || null, repositoryName: name.trim() || null });
      setMessage('绑定已保存');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="repository-binding grid gap-3 py-4">
      <h3>绑定代码仓库</h3>
      {readOnly ? (
        <p>{binding.repositoryName ?? '未绑定'}（仅项目管理员可修改）</p>
      ) : (
        <>
          <Label className="grid gap-2">
            已上报仓库
            <NativeSelect
              aria-label="已上报仓库"
              value={id}
              onChange={(event) => {
                setId(event.target.value);
                setName(repositories.find((item) => item.id === event.target.value)?.name ?? '');
              }}
            >
              <option value="">手动填写 / 解除绑定</option>
              {repositories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.deviceName}
                </option>
              ))}
            </NativeSelect>
          </Label>
          <Label className="grid gap-2">
            仓库名称
            <Input
              value={name}
              maxLength={120}
              disabled={Boolean(id)}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如 markfix"
            />
          </Label>
          {!id && name && <p>待关联：仓库上报后，请从列表中选择确认绑定。</p>}
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? '正在保存…' : '保存绑定'}
          </Button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
