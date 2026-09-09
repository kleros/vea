import { Button } from "@kleros/ui-components-library";

interface FilterPanelHeaderProps {
  title: string;
  hasActiveFilter: boolean;
  onClearFilters: () => void;
}

export default function FilterPanelHeader({
  title,
  hasActiveFilter,
  onClearFilters,
}: Readonly<FilterPanelHeaderProps>) {
  return (
    <div className="px-5 py-3 border-b border-(--border) flex items-center justify-between bg-(--surface)">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
          />
        </svg>
        <span className="text-sm font-semibold text-(--text-secondary)">{title}</span>
        {hasActiveFilter && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-700 text-white font-medium">Active</span>
        )}
      </div>
      {hasActiveFilter && <Button variant="secondary" small onPress={onClearFilters} text="Clear filters" />}
    </div>
  );
}
