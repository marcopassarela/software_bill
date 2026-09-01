'use client';
import React, { useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn } from 'lucide-react';

/**
 * Modal de recorte de foto de perfil.
 * O usuário arrasta a imagem para posicionar e usa o slider (ou a roda do mouse)
 * para dar zoom / redimensionar como quiser dentro do círculo de recorte.
 * Ao confirmar, gera um dataURL JPEG já recortado e redimensionado.
 */

const FRAME_SIZE = 260; // tamanho (px) da área de recorte mostrada na tela
const OUTPUT_SIZE = 320; // resolução final salva (px)

export default function AvatarCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1); // 1 = imagem cobre o círculo inteiro (mínimo)
  const [minZoom, setMinZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // deslocamento em px de tela
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  // Carrega a imagem escolhida
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const baseScale = FRAME_SIZE / Math.min(image.width, image.height);
      setMinZoom(baseScale);
      setZoom(baseScale);
      setOffset({ x: 0, y: 0 });
      setImg(image);
    };
    image.onerror = () => setError('Não foi possível ler essa imagem.');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clampOffset(next: { x: number; y: number }, currentZoom: number) {
    if (!img) return next;
    const w = img.width * currentZoom;
    const h = img.height * currentZoom;
    const maxX = Math.max(0, (w - FRAME_SIZE) / 2);
    const maxY = Math.max(0, (h - FRAME_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(
      clampOffset(
        { x: dragState.current.origX + dx, y: dragState.current.origY + dy },
        zoom
      )
    );
  }

  function onPointerUp() {
    dragState.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.03 : 0.03;
    changeZoom(zoom + delta);
  }

  function changeZoom(nextZoom: number) {
    if (!img) return;
    const maxZoom = minZoom * 4;
    const z = Math.min(maxZoom, Math.max(minZoom, nextZoom));
    setZoom(z);
    setOffset((prev) => clampOffset(prev, z));
  }

  function confirm() {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Escala do "espaço de tela" (FRAME_SIZE) para o "espaço de saída" (OUTPUT_SIZE)
    const outScale = OUTPUT_SIZE / FRAME_SIZE;
    const drawW = img.width * zoom * outScale;
    const drawH = img.height * zoom * outScale;
    const drawX = OUTPUT_SIZE / 2 - drawW / 2 + offset.x * outScale;
    const drawY = OUTPUT_SIZE / 2 - drawH / 2 + offset.y * outScale;

    // recorte circular
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    onConfirm(canvas.toDataURL('image/jpeg', 0.85));
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Ajustar foto</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        <div
          className="relative mx-auto overflow-hidden rounded-full bg-slate-100 select-none"
          style={{ width: FRAME_SIZE, height: FRAME_SIZE, touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute cursor-move"
              style={{
                left: '50%',
                top: '50%',
                width: img.width * zoom,
                height: img.height * zoom,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>

        <p className="mt-2 text-center text-[11px] text-slate-400">
          Arraste para posicionar. Use o controle abaixo (ou a roda do mouse) para redimensionar.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <ZoomIn size={16} className="text-slate-400" />
          <input
            type="range"
            min={minZoom}
            max={minZoom * 4}
            step={minZoom / 100}
            value={zoom}
            onChange={(e) => changeZoom(parseFloat(e.target.value))}
            className="flex-1"
            disabled={!img}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!img}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            <Check size={14} />
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}