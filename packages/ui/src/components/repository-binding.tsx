import { useEffect, useId, useState } from 'react';
import { Button } from './button.js';
import { Input } from './input.js';
import { Label } from './label.js';
import { RadioGroup, RadioGroupItem } from './radio-group.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.js';
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
  const fieldId = useId();
  const [mode, setMode] = useState('existing');
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
      await onSave(
        mode === 'existing'
          ? {
              repositoryId: id,
              repositoryName: repositories.find((item) => item.id === id)?.name ?? null,
            }
          : { repositoryId: null, repositoryName: name.trim() },
      );
      setMessage('绑定已保存');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="repository-binding grid gap-4 py-2">
      {readOnly ? (
        <p>{binding.repositoryName ?? '未绑定'}（仅项目管理员可修改）</p>
      ) : (
        <>
          <RadioGroup
            aria-label="绑定方式"
            value={mode}
            onValueChange={(value) => {
              setMode(value);
              setMessage('');
            }}
            className="repository-binding-modes flex gap-6"
            disabled={busy}
          >
            <Label
              className="repository-binding-choice flex items-center gap-2"
              htmlFor={`${fieldId}-custom`}
            >
              <RadioGroupItem id={`${fieldId}-custom`} value="custom" />
              自定义
            </Label>
            <Label
              className="repository-binding-choice flex items-center gap-2"
              htmlFor={`${fieldId}-existing`}
            >
              <RadioGroupItem id={`${fieldId}-existing`} value="existing" />
              从已有选择
            </Label>
          </RadioGroup>
          {mode === 'existing' ? (
            <Select value={id} onValueChange={setId} disabled={busy || !repositories.length}>
              <SelectTrigger aria-label="CLI 上报的项目" className="w-full">
                <SelectValue
                  placeholder={repositories.length ? '选择项目' : '暂无 CLI 上报的项目'}
                />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · {item.deviceName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              aria-label="自定义项目名称"
              value={name}
              maxLength={120}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="输入项目名称"
            />
          )}
          <Button
            disabled={
              busy ||
              (mode === 'existing' ? !repositories.some((item) => item.id === id) : !name.trim())
            }
            onClick={() => void save()}
          >
            {busy ? '正在保存…' : '保存'}
          </Button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
