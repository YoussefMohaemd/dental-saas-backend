export type SortDirection = 'asc' | 'desc';

export interface SearchQuery {
  term?: string;
}

export interface SortQuery {
  field?: string;
  direction?: SortDirection;
}

export interface CollectionQuery extends SearchQuery, SortQuery {
  includeArchived?: boolean;
}
