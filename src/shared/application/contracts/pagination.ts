export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export interface PaginationMeta extends PaginationQuery {
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResult<TItem> {
  items: TItem[];
  meta: PaginationMeta;
}

export function normalizePaginationQuery(input: {
  page?: number | string;
  pageSize?: number | string;
}): PaginationQuery {
  const page = normalizePositiveInt(input.page, DEFAULT_PAGE);
  const pageSize = normalizePositiveInt(input.pageSize, DEFAULT_PAGE_SIZE);

  return {
    page,
    pageSize: Math.min(pageSize, MAX_PAGE_SIZE),
  };
}

export function buildPaginationMeta(totalItems: number, query: PaginationQuery): PaginationMeta {
  const safeTotalItems = Math.max(0, Math.floor(totalItems));
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / query.pageSize));

  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems: safeTotalItems,
    totalPages,
  };
}

function normalizePositiveInt(value: number | string | undefined, fallback: number): number {
  const numeric = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (!Number.isInteger(numeric) || numeric === undefined || numeric < 1) {
    return fallback;
  }

  return numeric;
}
