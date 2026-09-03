import type { RecorderEvent, ReproductionStep } from '@markfix/contracts';

export const describeTrustedEvent = (event: RecorderEvent): string => {
  switch (event.type) {
    case 'click':
      return `Click ${event.elementName ?? 'element'}`;
    case 'input':
      return `Enter ${event.valueLength ?? 0} characters in ${event.elementName ?? 'field'}`;
    case 'select':
      return `Change ${event.elementName ?? 'selection'}`;
    case 'scroll':
      return `Scroll to ${Math.round(event.scrollYCssPx ?? 0)} px`;
    case 'drag':
      return `Drag from ${event.elementName ?? 'element'}`;
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
      step.timestampMs - previous.timestampMs <= 500 &&
      step.anchor?.kind === 'element' &&
      previous.anchor?.kind === 'element' &&
      step.anchor.cssSelector === previous.anchor.cssSelector
    ) {
      merged[merged.length - 1] = step;
    } else {
      merged.push(step);
    }
  }
  return merged;
};
