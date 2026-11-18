interface SparklineProps {
  points: number[];
  positive: boolean;
}

export function Sparkline({ points, positive }: SparklineProps) {
  if (!points || points.length < 2) {
    return <div className="w-16 h-6 bg-slate-100 rounded" aria-hidden="true" />;
  }

  const width = 64;
  const height = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((val - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const strokeColor = positive ? '#059669' : '#dc2626';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(' ')}
      />
    </svg>
  );
}
