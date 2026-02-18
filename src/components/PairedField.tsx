import { useState } from 'react';
import { NumericField } from './NumericField';
import { Label } from './ui/label';
import { Lock, LockOpen, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface PairedFieldProps {
  label: string;
  startValue: number;
  endValue: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  /** If true, shows bidirectional arrow (for random ranges). If false, shows unidirectional arrow (for start->end). */
  isRandom?: boolean;
  /** Sensitivity for pointer lock */
  sensitivity?: number;
  className?: string;
}

export function PairedField({
  label,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  min,
  max,
  step = 1,
  description,
  isRandom = false,
  sensitivity,
  className,
}: PairedFieldProps) {
  const [isLocked, setIsLocked] = useState(false);

  const handleLockToggle = () => {
    const newLocked = !isLocked;
    setIsLocked(newLocked);
    if (newLocked) {
      // When locking, sync end to start
      onEndChange(startValue);
    }
  };

  const handleStartChange = (value: number) => {
    onStartChange(value);
    if (isLocked) {
      // Sync end to start when locked
      onEndChange(value);
    }
  };

  return (
    <div className={cn('relative', className)}>
      {label && <Label className="text-xs">{label}</Label>}
      {description && <div className="text-[10px] text-muted-foreground mb-1">{description}</div>}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <NumericField
            label=""
            value={startValue}
            onChange={handleStartChange}
            min={min}
            max={max}
            step={step}
            sensitivity={sensitivity}
            className="w-full"
          />
        </div>
        
        <div className="flex items-center gap-1 pb-1">
          <button
            type="button"
            onClick={handleLockToggle}
            className={cn(
              'p-1 rounded hover:bg-muted transition-colors',
              isLocked && 'bg-muted'
            )}
            title={isLocked ? 'Unlock to set separate values' : 'Lock to sync values'}
          >
            {isLocked ? (
              <Lock className="h-3 w-3 text-muted-foreground" />
            ) : (
              <LockOpen className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
          
          <div className="text-muted-foreground">
            {isRandom ? (
              <ArrowLeftRight className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </div>
        </div>
        
        <div className="flex-1">
          <NumericField
            label=""
            value={endValue}
            onChange={onEndChange}
            min={min}
            max={max}
            step={step}
            disabled={isLocked}
            sensitivity={sensitivity}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
