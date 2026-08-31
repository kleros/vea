import type { ReactNode } from "react";

interface TableStatusProps {
  icon: ReactNode;
  message: string;
  action?: ReactNode;
}

export default function TableStatus({ icon, message, action }: Readonly<TableStatusProps>) {
  return (
    <div className="glass border border-(--border) py-16 text-center">
      {icon}
      <p className="text-(--text-muted) text-sm">{message}</p>
      {action}
    </div>
  );
}
