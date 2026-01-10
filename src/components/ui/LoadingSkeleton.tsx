import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  className?: string;
}

export function LoadingSkeleton({ className }: LoadingSkeletonProps) {
  return (
    <div 
      className={cn(
        'animate-pulse-subtle bg-muted rounded',
        className
      )} 
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="stat-card space-y-4">
      <LoadingSkeleton className="h-4 w-24" />
      <LoadingSkeleton className="h-8 w-32" />
      <LoadingSkeleton className="h-3 w-20" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr>
      <td className="py-4 px-4 border-b border-border">
        <LoadingSkeleton className="h-4 w-20" />
      </td>
      <td className="py-4 px-4 border-b border-border">
        <LoadingSkeleton className="h-4 w-16" />
      </td>
      <td className="py-4 px-4 border-b border-border">
        <LoadingSkeleton className="h-5 w-20 rounded-full" />
      </td>
      <td className="py-4 px-4 border-b border-border">
        <LoadingSkeleton className="h-4 w-28" />
      </td>
      <td className="py-4 px-4 border-b border-border">
        <LoadingSkeleton className="h-4 w-32" />
      </td>
    </tr>
  );
}
