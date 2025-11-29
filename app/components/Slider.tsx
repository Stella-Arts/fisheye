'use client';

import { useId } from 'react';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showPercentage?: boolean;
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  showPercentage = true,
}: SliderProps) {
  const id = useId();
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="text-sm font-medium text-[#BCBEC8] select-none">
        {label}
      </label>
      <div className="relative w-48 h-4 flex items-center">
        {/* Track background */}
        <div className="absolute inset-0 h-1 my-auto rounded-full bg-[#333439]" />
        {/* Track fill */}
        <div
          className="absolute left-0 h-1 my-auto rounded-full bg-[#BCBEC8]"
          style={{ width: `${percentage}%` }}
        />
        {/* Native input */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {/* Custom thumb */}
        <div
          className="absolute w-4 h-4 rounded-full bg-[#BCBEC8] shadow-md pointer-events-none transition-transform hover:scale-110"
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>
      {showPercentage && (
        <span className="text-sm font-medium text-[#BCBEC8] tabular-nums w-10 text-right select-none">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}

