import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function NewUiGroup({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

export function NewUiFieldRow({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground/70">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

export function NewUiHint({ children, large }: { children: ReactNode; large?: boolean }) {
  return (
    <p
      className={cn(
        'leading-snug text-muted-foreground/85',
        large ? 'text-sm' : 'text-[13px]',
      )}
    >
      {children}
    </p>
  )
}
