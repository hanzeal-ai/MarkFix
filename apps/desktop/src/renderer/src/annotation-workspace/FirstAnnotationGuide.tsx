import { X } from '@markfix/ui/icons';
import { Button } from '@markfix/ui';

export type FirstAnnotationGuideStep = 'select' | 'describe' | 'complete';

export const firstAnnotationGuideStep = ({
  active,
  editing,
  enabled,
  hasDescription,
  hasSelection,
}: {
  active: boolean;
  editing: boolean;
  enabled: boolean;
  hasDescription: boolean;
  hasSelection: boolean;
}): FirstAnnotationGuideStep | undefined => {
  if (!active || !enabled || editing) return undefined;
  if (!hasSelection) return 'select';
  return hasDescription ? 'complete' : 'describe';
};

const guideCopy = {
  comment: {
    label: '首次批注',
    steps: {
      select: {
        title: '选择要批注的元素',
        description: '在页面中移动鼠标并点击目标元素。',
      },
      describe: {
        title: '填写修改说明',
        description: '直接说明希望怎样修改，不必重复页面文字。',
      },
      complete: {
        title: '完成这条批注',
        description: '点击对勾保存，之后可以继续选择其他元素。',
      },
    },
  },
  capture: {
    label: '首次截图',
    steps: {
      select: {
        title: '框选要说明的区域',
        description: '在页面中拖拽，建立一个截图选区。',
      },
      describe: {
        title: '标记并填写说明',
        description: '可在选区中添加标记，然后在这里说明问题。',
      },
      complete: {
        title: '完成这条截图',
        description: '点击对勾保存，截图会加入右侧列表。',
      },
    },
  },
} as const;

const stepNumber: Record<FirstAnnotationGuideStep, number> = {
  select: 1,
  describe: 2,
  complete: 3,
};

export function FirstAnnotationGuide({
  mode,
  step,
  onDismiss,
}: {
  mode: 'comment' | 'capture';
  step: FirstAnnotationGuideStep;
  onDismiss: () => void;
}) {
  const copy = guideCopy[mode];
  const content = copy.steps[step];

  return (
    <section className={`first-annotation-guide ${step}`} aria-live="polite">
      <div className="first-annotation-guide-heading">
        <span>
          {copy.label} · {stepNumber[step]}/3
        </span>
        <Button type="button" aria-label="跳过首次引导" title="跳过引导" onClick={onDismiss}>
          <X />
        </Button>
      </div>
      <strong>{content.title}</strong>
      <p>{content.description}</p>
    </section>
  );
}
