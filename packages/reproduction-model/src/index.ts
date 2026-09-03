import type { ReproductionStep } from '@markfix/contracts';

export const describeTrustedEvent = (event: {
  type: 'click' | 'input' | 'scroll' | 'navigation';
  elementName?: string;
  valueLength?: number;
  url?: string;
  scrollYCssPx?: number;
}): string => {
  switch (event.type) {
    case 'click':
      return `Click ${event.elementName ?? 'element'}`;
    case 'input':
      return `Enter ${event.valueLength ?? 0} characters in ${event.elementName ?? 'field'}`;
    case 'scroll':
      return `Scroll to ${Math.round(event.scrollYCssPx ?? 0)} px`;
    case 'navigation':
      return `Navigate to ${event.url ?? 'page'}`;
  }
};

export const mergeAdjacentInputSteps = (steps: readonly ReproductionStep[]): ReproductionStep[] => {
  const merged: ReproductionStep[] = [];
  for (const step of steps) {
    const previous = merged.at(-1);
    if (
      step.type === 'input' &&
      previous?.type === 'input' &&
      step.timestampMs - previous.timestampMs < 1500
    ) {
      merged[merged.length - 1] = step;
    } else {
      merged.push(step);
    }
  }
  return merged;
};
