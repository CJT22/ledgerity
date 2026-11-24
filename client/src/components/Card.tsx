import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  padding = 'md',
}) => {
  const padClass =
    padding === 'none'
      ? ''
      : padding === 'sm'
        ? 'p-4'
        : padding === 'lg'
          ? 'p-6'
          : 'p-5';

  const InteractiveTag = onClick ? 'button' : 'div';

  return (
    <InteractiveTag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-left transition-colors ${padClass} ${
        onClick
          ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
          : ''
      } ${className}`}
    >
      {children}
    </InteractiveTag>
  );
};
