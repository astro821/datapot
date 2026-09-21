import { AgGridReact, type AgGridReactProps } from 'ag-grid-react';

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

type DataGridProps<T> = AgGridReactProps<T> & {
  className?: string;
};

/** Full-height grid with footer pagination */
export function DataGrid<T>({ className = '', ...props }: DataGridProps<T>) {
  return (
    <div className={`ag-theme-alpine dpot-grid ${className}`.trim()}>
      <AgGridReact<T>
        animateRows
        pagination
        paginationPageSize={20}
        paginationPageSizeSelector={DEFAULT_PAGE_SIZES}
        suppressCellFocus
        {...props}
      />
    </div>
  );
}
