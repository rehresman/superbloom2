import React from 'react';

interface ControlSliderProps {
  name: string;
  value: number;
  midiValue: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  scale?: 'linear' | 'exponential';
  displayValue?: boolean;
}

const ControlSlider: React.FC<ControlSliderProps> = ({
  name,
  value,
  midiValue,
  onChange,
  min = 0,
  max = 127,
  scale = 'linear',
  displayValue = true,
}) => {
  const displayNumber = (num: number): string => {
    if (scale === 'exponential') {
      if (num < 1000) {
        return num.toFixed(0).padStart(3, '0');
      }
      return (num/1000).toFixed(1) + 'k';
    }
    return num.toString().padStart(3, '0');
  };

  return (
    <label>
      {name}:{displayValue && ` ${displayNumber(value)}`}
      <input
        type="range"
        min={0}
        max={127}
        value={midiValue}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
      />
    </label>
  );
};

export default ControlSlider;
