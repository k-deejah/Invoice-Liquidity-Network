import React from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  illustration: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, illustration, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center isolate">
      {/* Container for illustration */}
      <div className="w-48 h-48 mb-6 relative">
        {illustration}
      </div>
      
      <h3 className="text-xl font-bold text-on-surface mb-2">{title}</h3>
      <p className="text-sm text-on-surface-variant max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}
