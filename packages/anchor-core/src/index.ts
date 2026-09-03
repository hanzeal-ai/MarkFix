import type { ElementAnchor } from '@markfix/contracts';

export type AnchorCandidate = {
  cssSelectorMatched: boolean;
  textQuote: string;
  tagName: string;
  attributes: Record<string, string>;
  centerDistanceCssPx: number;
};

export type AnchorMatch = {
  confidence: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
};

const normalizedSimilarity = (left: string, right: string): number => {
  const a = left.trim().toLocaleLowerCase();
  const b = right.trim().toLocaleLowerCase();
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a))
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size);
};

export const scoreAnchorCandidate = (
  anchor: ElementAnchor,
  candidate: AnchorCandidate,
): AnchorMatch => {
  const reasons: string[] = [];
  let score = 0;

  if (candidate.cssSelectorMatched) {
    score += 0.4;
    reasons.push('selector');
  }
  if (candidate.tagName.toLocaleLowerCase() === anchor.tagName.toLocaleLowerCase()) {
    score += 0.1;
    reasons.push('tag');
  }
  const textScore = normalizedSimilarity(anchor.textQuote, candidate.textQuote) * 0.25;
  if (textScore > 0.1) reasons.push('text');
  score += textScore;

  const anchorAttributes = Object.entries(anchor.attributes);
  if (anchorAttributes.length > 0) {
    const matches = anchorAttributes.filter(
      ([key, value]) => candidate.attributes[key] === value,
    ).length;
    const attributeScore = (matches / anchorAttributes.length) * 0.15;
    if (attributeScore > 0.05) reasons.push('attributes');
    score += attributeScore;
  }

  const geometryScore = Math.max(0, 1 - candidate.centerDistanceCssPx / 800) * 0.1;
  if (geometryScore > 0.05) reasons.push('geometry');
  score += geometryScore;

  const roundedScore = Math.round(Math.min(1, score) * 100) / 100;
  return {
    score: roundedScore,
    confidence: roundedScore >= 0.8 ? 'high' : roundedScore >= 0.55 ? 'medium' : 'low',
    reasons,
  };
};

export const pickBestAnchorCandidate = (
  anchor: ElementAnchor,
  candidates: readonly AnchorCandidate[],
): { candidate: AnchorCandidate; match: AnchorMatch } | undefined =>
  candidates
    .map((candidate) => ({ candidate, match: scoreAnchorCandidate(anchor, candidate) }))
    .sort((left, right) => right.match.score - left.match.score)[0];
