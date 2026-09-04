export const selectPageRecords = <T extends { pageUrl: string }>(
  records: readonly T[],
  pageUrl: string,
): T[] => records.filter((record) => record.pageUrl === pageUrl);
