"use client";

import { useRef, useState, useEffect } from "react";

interface PatternLockProps {
  onComplete: (pattern: string) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  showCancel?: boolean;
  theme?: "dark" | "light";
}

interface Point {
  x: number;
  y: number;
  index: number;
}

export default function PatternLock({
  onComplete,
  onCancel,
  title = "Gambar Pola Kunci",
  subtitle = "Hubungkan minimal 4 titik",
  showCancel = true,
  theme = "light",
}: PatternLockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const pointsRef = useRef<Point[]>([]);

  const GRID_SIZE = 3;
  const POINT_RADIUS = 20;
  const SELECTED_RADIUS = 28;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size — lebih kecil untuk mode embedded
    const size = Math.min(window.innerWidth - 80, 280);
    canvas.width = size;
    canvas.height = size;

    // Calculate points positions
    const spacing = size / (GRID_SIZE + 1);
    pointsRef.current = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        pointsRef.current.push({
          x: spacing * (col + 1),
          y: spacing * (row + 1),
          index: row * GRID_SIZE + col,
        });
      }
    }

    drawPattern();
  }, [selectedPoints, currentPos]);

  const drawPattern = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const isDark = theme === "dark";

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw lines between selected points
    if (selectedPoints.length > 0) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(59, 130, 246, 0.6)";
      ctx.shadowBlur = 12;

      ctx.beginPath();
      const firstPoint = pointsRef.current[selectedPoints[0]];
      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < selectedPoints.length; i++) {
        const point = pointsRef.current[selectedPoints[i]];
        ctx.lineTo(point.x, point.y);
      }

      // Draw line to current position if drawing
      if (currentPos && isDrawing) {
        ctx.lineTo(currentPos.x, currentPos.y);
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw points
    pointsRef.current.forEach((point) => {
      const isSelected = selectedPoints.includes(point.index);

      // Outer glow for selected points
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, SELECTED_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.18)";
        ctx.fill();
      }

      // Main circle (ring)
      ctx.beginPath();
      ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
      if (isSelected) {
        ctx.fillStyle = "#3b82f6";
      } else {
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
      }
      ctx.fill();

      // Border ring
      ctx.beginPath();
      ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? "#60a5fa" : (isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)");
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(point.x, point.y, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : (isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)");
      ctx.fill();
    });
  };

  const getPointAtPosition = (x: number, y: number): number | null => {
    for (const point of pointsRef.current) {
      const distance = Math.sqrt(
        Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2)
      );
      if (distance <= POINT_RADIUS + 10) {
        return point.index;
      }
    }
    return null;
  };

  const handleStart = (x: number, y: number) => {
    const pointIndex = getPointAtPosition(x, y);
    if (pointIndex !== null) {
      setIsDrawing(true);
      setSelectedPoints([pointIndex]);
      setCurrentPos({ x, y });
    }
  };

  const handleMove = (x: number, y: number) => {
    if (!isDrawing) return;

    setCurrentPos({ x, y });

    const pointIndex = getPointAtPosition(x, y);
    if (pointIndex !== null && !selectedPoints.includes(pointIndex)) {
      setSelectedPoints((prev) => [...prev, pointIndex]);
    }
  };

  const handleEnd = () => {
    if (!isDrawing) return;

    setIsDrawing(false);
    setCurrentPos(null);

    if (selectedPoints.length >= 4) {
      // Encode pattern as base64
      const patternString = selectedPoints.join("-");
      const encoded = btoa(patternString);
      onComplete(encoded);
    } else {
      // Reset if less than 4 points
      setTimeout(() => {
        setSelectedPoints([]);
      }, 300);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    handleStart(touch.clientX - rect.left, touch.clientY - rect.top);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    handleMove(touch.clientX - rect.left, touch.clientY - rect.top);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    handleStart(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    handleMove(e.clientX - rect.left, e.clientY - rect.top);
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {(title || subtitle) && (
        <div className="text-center mb-4">
          {title && <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-1">{title}</h2>}
          {subtitle && <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>}
          {selectedPoints.length > 0 && selectedPoints.length < 4 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {4 - selectedPoints.length} titik lagi
            </p>
          )}
        </div>
      )}

      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleEnd}
          className="rounded-2xl cursor-pointer touch-none"
          style={{ maxWidth: "320px", width: "100%", background: "transparent" }}
        />
      </div>

      {showCancel && onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 px-6 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Batal
        </button>
      )}
    </div>
  );
}
