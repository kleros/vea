"use client";

interface StatusIndicatorProps {
  current: number;
  required: number;
  size?: "sm" | "md" | "lg";
}

export default function StatusIndicator({ current, required, size = "md" }: StatusIndicatorProps) {
  const percentage = (current / required) * 100;
  const isComplete = current >= required;
  const inProgress = current > 0 && current < required;

  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const strokeWidth = {
    sm: 3,
    md: 4,
    lg: 5,
  };

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${sizeClasses[size]}`}>
        <svg className="transform -rotate-90 w-full h-full">
          {/* Background circle */}
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            stroke="rgba(139, 92, 246, 0.2)"
            strokeWidth={strokeWidth[size]}
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            stroke={isComplete ? "#10B981" : inProgress ? "#F59E0B" : "#EF4444"}
            strokeWidth={strokeWidth[size]}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
            style={{
              filter: isComplete
                ? "drop-shadow(0 0 8px rgba(16, 185, 129, 0.5))"
                : inProgress
                ? "drop-shadow(0 0 8px rgba(245, 158, 11, 0.5))"
                : "none",
            }}
          />
        </svg>
        <div className={`absolute inset-0 flex items-center justify-center ${textSizes[size]} font-bold`}>
          <span className={isComplete ? "text-green-400" : inProgress ? "text-amber-400" : "text-red-400"}>
            {current}/{required}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span
          className={`${textSizes[size]} font-medium ${
            isComplete ? "text-green-400" : inProgress ? "text-amber-400" : "text-red-400"
          }`}
        >
          {isComplete ? "Complete" : inProgress ? "In Progress" : "Pending"}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{Math.round(percentage)}% threshold</span>
      </div>
    </div>
  );
}
