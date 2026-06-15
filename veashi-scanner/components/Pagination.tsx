"use client";
import { StandardPagination } from "@kleros/ui-components-library";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  return <StandardPagination currentPage={currentPage} numPages={totalPages} callback={onPageChange} />;
}
