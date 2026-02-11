import { useState } from 'react';
import { useFloating, autoUpdate, offset, shift, flip } from '@floating-ui/react-dom';
import { Input } from './ui/input';
import { Label } from './ui/label';
import type { GenerateArea, ConfigOptionMeta } from '../../generator/config';
import { PreviewCanvas } from './PreviewCanvas';

// MinMax field component
interface MinMaxFieldWithPreviewProps {
  meta: ConfigOptionMeta;
  value: [number, number];
  config: GenerateArea;
  onValueChange: (value: [number, number]) => void;
  onMinMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void;
  onMaxMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void;
}

export function MinMaxFieldWithPreview({
  meta,
  value,
  config,
  onValueChange,
  onMinMouseDown,
  onMaxMouseDown,
}: MinMaxFieldWithPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { refs, floatingStyles } = useFloating({
    placement: 'right',
    middleware: [offset(10), shift(), flip()],
    whileElementsMounted: autoUpdate,
  });

  const hasPreview = !!meta.previewValue;

  return (
    <div className="relative">
      <Label className="text-xs">{meta.label || meta.key}</Label>
      {meta.description && <div className="text-[10px] text-muted-foreground mb-1">{meta.description}</div>}
      <div
        ref={refs.setReference}
        onMouseEnter={() => hasPreview && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex gap-1 relative"
      >
        <Input
          type="number"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={value[0]}
          onChange={(e) => {
            const parsed = meta.step && meta.step < 1 
              ? parseFloat(e.target.value) 
              : parseInt(e.target.value);
            const newVal = isNaN(parsed) ? value[0] : parsed;
            onValueChange([newVal, value[1]]);
          }}
          onMouseDown={onMinMouseDown}
          className="h-8 text-xs cursor-ew-resize"
          title="Click and drag left/right to adjust min value"
        />
        <Input
          type="number"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={value[1]}
          onChange={(e) => {
            const parsed = meta.step && meta.step < 1 
              ? parseFloat(e.target.value) 
              : parseInt(e.target.value);
            const newVal = isNaN(parsed) ? value[1] : parsed;
            onValueChange([value[0], newVal]);
          }}
          onMouseDown={onMaxMouseDown}
          className="h-8 text-xs cursor-ew-resize"
          title="Click and drag left/right to adjust max value"
        />
        {hasPreview && isHovered && (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 bg-card border border-border rounded-md shadow-lg p-2"
          >
            <PreviewCanvas meta={meta} config={config} isVisible={true} />
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfigFieldWithPreviewProps {
  meta: ConfigOptionMeta;
  value: number;
  config: GenerateArea;
  onValueChange: (value: number) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void;
  title?: string;
}

export function ConfigFieldWithPreview({
  meta,
  value,
  config,
  onValueChange,
  onMouseDown,
  title,
}: ConfigFieldWithPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { refs, floatingStyles } = useFloating({
    placement: 'right',
    middleware: [offset(10), shift(), flip()],
    whileElementsMounted: autoUpdate,
  });

  const hasPreview = !!meta.previewValue;

  return (
    <div className="relative">
      <Label className="text-xs">{meta.label || meta.key}</Label>
      {meta.description && <div className="text-[10px] text-muted-foreground mb-1">{meta.description}</div>}
      <div
        ref={refs.setReference}
        onMouseEnter={() => hasPreview && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative"
      >
        <Input
          type="number"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={value}
          onChange={(e) => {
            const parsed = meta.step && meta.step < 1 
              ? parseFloat(e.target.value) 
              : parseInt(e.target.value);
            onValueChange(isNaN(parsed) ? (meta.default ?? 0) : parsed);
          }}
          onMouseDown={onMouseDown}
          className="h-8 text-xs cursor-ew-resize"
          title={title || "Click and drag left/right to adjust value"}
        />
        {hasPreview && isHovered && (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 bg-card border border-border rounded-md shadow-lg p-2"
          >
            <PreviewCanvas meta={meta} config={config} isVisible={true} />
          </div>
        )}
      </div>
    </div>
  );
}
