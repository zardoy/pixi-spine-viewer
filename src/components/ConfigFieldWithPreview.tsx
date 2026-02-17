import { useState } from 'react';
import { useFloating, autoUpdate, offset, shift, flip } from '@floating-ui/react-dom';
import { Label } from './ui/label';
import { NumericField } from './NumericField';
import type { GenerateArea, ConfigOptionMeta } from '../../generator/config';
import { PreviewCanvas } from './PreviewCanvas';

// MinMax field component
interface MinMaxFieldWithPreviewProps {
  meta: ConfigOptionMeta;
  value: [number, number];
  config: GenerateArea;
  onValueChange: (value: [number, number]) => void;
}

export function MinMaxFieldWithPreview({
  meta,
  value,
  config,
  onValueChange,
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
      <div
        ref={refs.setReference}
        onMouseEnter={() => hasPreview && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative"
      >
        <Label className="text-xs">{meta.label || meta.key}</Label>
        {meta.description && <div className="text-[10px] text-muted-foreground mb-1">{meta.description}</div>}
        <div className="flex gap-1">
          <NumericField
            id={`${meta.key}-min`}
            label="Min"
            value={value[0]}
            onChange={(val) => onValueChange([val, value[1]])}
            min={meta.min}
            max={meta.max}
            step={meta.step}
            sensitivity={meta.step ? meta.step * 10 : 1}
            className="flex-1"
          />
          <NumericField
            id={`${meta.key}-max`}
            label="Max"
            value={value[1]}
            onChange={(val) => onValueChange([value[0], val])}
            min={meta.min}
            max={meta.max}
            step={meta.step}
            sensitivity={meta.step ? meta.step * 10 : 1}
            className="flex-1"
          />
        </div>
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
}

export function ConfigFieldWithPreview({
  meta,
  value,
  config,
  onValueChange,
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
      <div
        ref={refs.setReference}
        onMouseEnter={() => hasPreview && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative"
      >
        <NumericField
          id={meta.key}
          label={meta.label || meta.key}
          value={value}
          onChange={onValueChange}
          min={meta.min}
          max={meta.max}
          step={meta.step}
          description={meta.description}
          sensitivity={meta.step ? meta.step * 10 : 1}
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
