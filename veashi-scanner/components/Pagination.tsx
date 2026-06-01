"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = [];
  const maxVisible = 5;

  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-elevated)] transition-colors"
      >
        Previous
      </button>

      <div className="flex items-center gap-2">
        {startPage > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className="w-10 h-10 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--surface-elevated)] transition-colors"
            >
              1
            </button>
            {startPage > 2 && <span className="text-[var(--text-muted)]">...</span>}
          </>
        )}

        {pages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`w-10 h-10 rounded-lg border text-sm font-medium transition-all ${
              page === currentPage
                ? "bg-gradient-to-r from-[var(--purple-700)] to-[var(--pink-600)] border-transparent text-white"
                : "border-[var(--border)] hover:bg-[var(--surface-elevated)]"
            }`}
          >
            {page}
          </button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="text-[var(--text-muted)]">...</span>}
            <button
              onClick={() => onPageChange(totalPages)}
              className="w-10 h-10 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--surface-elevated)] transition-colors"
            >
              {totalPages}
            </button>
          </>
        )}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-elevated)] transition-colors"
      >
        Next
      </button>
    </div>
  );
}
