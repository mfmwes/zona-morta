"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Move, RotateCcw, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { defaultPortraitFrame, dragPortraitFrame, portraitFrame, type PortraitFrame } from "@/lib/portrait-frame";

export function NpcPortrait({ src, frame, onAspect }: { src: string; frame?: PortraitFrame; onAspect?: (aspect: number) => void }) {
  const crop = portraitFrame(frame);
  return <img className="npc-framed-image" src={src} alt="" draggable={false}
    onLoad={event => onAspect?.(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
    style={{ objectPosition: `${crop.x}% ${crop.y}%`, transformOrigin: `${crop.x}% ${crop.y}%`, transform: `scale(${crop.zoom})` }} />;
}

export function NpcPortraitEditor({ src, frame, onChange }: { src: string; frame?: PortraitFrame; onChange: (value: PortraitFrame) => void }) {
  const crop = portraitFrame(frame);
  const [aspect, setAspect] = useState(1);
  const gesture = useRef<{ pointerId: number; x: number; y: number; size: number; frame: PortraitFrame } | null>(null);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, size: event.currentTarget.clientWidth, frame: crop };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onChange(dragPortraitFrame(drag.frame, event.clientX - drag.x, event.clientY - drag.y, drag.size, aspect));
  }
  function stop() { gesture.current = null; }
  const control = (label: string, key: keyof PortraitFrame, min: number, max: number, step: number) => <label className="npc-frame-slider">
    <span>{label}<output>{key === "zoom" ? `${crop.zoom.toFixed(1)}×` : `${Math.round(crop[key])}%`}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={crop[key]} onChange={event => onChange({ ...crop, [key]: Number(event.target.value) })} />
  </label>;
  return <section className="npc-frame-editor" aria-label="Enquadramento do retrato">
    <div className="npc-frame-heading"><b><Move size={16} /> Enquadrar retrato</b><span>A imagem completa é preservada.</span></div>
    <div className="npc-frame-layout">
      <div className="npc-frame-preview" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
        <NpcPortrait src={src} frame={crop} onAspect={setAspect} />
      </div>
      <div className="npc-frame-controls"><p>Arraste a imagem para posicionar o rosto. Use o zoom para aproximar.</p>
        {control("Zoom do retrato", "zoom", 1, 5, .1)}
        {control("Posição horizontal", "x", 0, 100, 1)}
        {control("Posição vertical", "y", 0, 100, 1)}
        <div className="npc-frame-result"><span className="npc-avatar"><NpcPortrait src={src} frame={crop} /></span><small><ZoomIn size={14} /> Assim aparece no card</small></div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...defaultPortraitFrame })}><RotateCcw size={14} /> Redefinir enquadramento</Button>
      </div>
    </div>
  </section>;
}
