import React, { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { BLUEPRINT_LIMITS } from '../types';

interface SignaturePadProps {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
}

export function SignaturePad({ label, value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value && value.startsWith('data:image/')) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = value;
    }
  }, [value]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.setPointerCapture(e.pointerId);
    const pt = getPoint(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    setDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    setDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }
    const dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length <= BLUEPRINT_LIMITS.SIGNATURE_MAX) {
      onChange(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <Eraser className="w-3 h-3" />
          Clear
        </button>
      </div>
      <div className="relative bg-white border border-slate-300 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={320}
          height={96}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className="w-full h-24 touch-none cursor-crosshair block"
          aria-label={label}
        />
        {!value && !drawing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">
            Sign here with mouse or touch
          </div>
        )}
      </div>
    </div>
  );
}
