import { useRef, useEffect, useCallback, useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface NumericFieldProps {
  id?: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  description?: string;
  /** Sensitivity multiplier for pointer lock (default: 1) */
  sensitivity?: number;
}

export const NumericField = ({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  className = '',
  inputClassName = '',
  description,
  sensitivity = 1,
}: NumericFieldProps) => {
  const labelRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pointerLockActive, setPointerLockActive] = useState(false);
  const startValueRef = useRef<number>(value);
  const sensitivityRef = useRef<number>(sensitivity * (step || 1) * 10);
  
  // Use refs to access latest values without triggering re-runs
  const valueRef = useRef<number>(value);
  const onChangeRef = useRef(onChange);
  const minRef = useRef(min);
  const maxRef = useRef(max);

  // Update refs when values change
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    minRef.current = min;
    maxRef.current = max;
  }, [value, onChange, min, max]);

  // Update startValueRef when value changes externally (not from pointer lock)
  useEffect(() => {
    if (!pointerLockActive) {
      startValueRef.current = value;
    }
  }, [value, pointerLockActive]);

  // Handle pointer lock movement - ONLY depends on pointerLockActive
  useEffect(() => {
    if (!pointerLockActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) {
        setPointerLockActive(false);
        startValueRef.current = valueRef.current;
        return;
      }

      const delta = e.movementX * sensitivityRef.current;
      const newValue = Math.max(
        minRef.current ?? -Infinity,
        Math.min(maxRef.current ?? Infinity, startValueRef.current + delta)
      );

      onChangeRef.current(newValue);
      startValueRef.current = newValue;
    };

    const handlePointerLockChange = () => {
      if (!document.pointerLockElement) {
        setPointerLockActive(false);
        startValueRef.current = valueRef.current;
      }
    };

    const handleMouseUp = () => {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mouseup', handleMouseUp);
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
  }, [pointerLockActive]); // ONLY pointerLockActive dependency

  const handleLabelMouseDown = useCallback(async (e: React.MouseEvent<HTMLLabelElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const label = labelRef.current;
    if (!label) return;

    try {
      // Request pointer lock on the document element
      if (document.documentElement.requestPointerLock) {
        await document.documentElement.requestPointerLock();
        setPointerLockActive(true);
        startValueRef.current = value;
      }
    } catch (err) {
      console.error('Pointer lock failed:', err);
    }
  }, [disabled, value]);

  return (
    <div className={className}>
      <Label
        ref={labelRef}
        htmlFor={id}
        onMouseDown={handleLabelMouseDown}
        className={`text-xs ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-ew-resize'} select-none`}
        title={disabled ? undefined : 'Click label and drag left/right to adjust value'}
      >
        {label}
      </Label>
      {description && <div className="text-[10px] text-muted-foreground mb-1">{description}</div>}
      <Input
        ref={inputRef}
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const parsed = step && step < 1
            ? parseFloat(e.target.value)
            : parseInt(e.target.value);
          onChange(isNaN(parsed) ? value : parsed);
        }}
        disabled={disabled}
        className={`h-8 text-xs ${inputClassName}`}
      />
    </div>
  );
};
