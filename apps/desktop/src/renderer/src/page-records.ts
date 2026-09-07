export const selectPageRecords = <T extends { pageUrl: string }>(
  records: readonly T[],
  pageUrl: string,
): T[] => records.filter((record) => record.pageUrl === pageUrl);

export const selectProjectPageRecords = <T extends { projectId: string; pageSessionId: string }>(
  records: readonly T[],
  projectId: string | undefined,
  pageSessionId: string | undefined,
): T[] =>
  projectId && pageSessionId
    ? records.filter(
        (record) => record.projectId === projectId && record.pageSessionId === pageSessionId,
      )
    : [];

export const selectEditableProjectPageRecords = <
  T extends { projectId: string; pageSessionId: string; status: string },
>(
  records: readonly T[],
  projectId: string | undefined,
  pageSessionId: string | undefined,
): T[] =>
  selectProjectPageRecords(records, projectId, pageSessionId).filter(
    (record) => record.status === 'draft' || record.status === 'rejected',
  );
