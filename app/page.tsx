'use client';

import { useRef, useEffect, useState } from 'react';
import { Slider } from './components/Slider';
import { initWebGPU, drawFrame, type WebGPUContext } from './utils/webgpu';

const WIDTH = 1920
const HEIGHT = 1080

export default function Home() {
  // refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // settings
  const [vignette, setVignette] = useState(0.5)
  const [distortion, setDistortion] = useState(0.0)
  const [scale, setScale] = useState(1.0)
  
  const gpuContextRef = useRef<WebGPUContext | null>(null)

  // runs once when the component mounts
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    let isRunning = true

    const start = async () => {
      const context = await initWebGPU(canvas, video, WIDTH, HEIGHT)
      if (!context || !isRunning) return

      gpuContextRef.current = context

      const draw = () => {
        if (!isRunning) return
        drawFrame(context, video)
        video.requestVideoFrameCallback(draw)
      }

      draw()
    }

    // start the video
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState
    if (video.readyState >= 3) start()
    else video.addEventListener('canplay', start, { once: true })

    // cleanup
    return () => {
      isRunning = false
      video.removeEventListener('canplay', start)
      if (gpuContextRef.current) gpuContextRef.current.root.destroy()
    }
  }, [])

  // when settings change, update the params buffer
  useEffect(() => {
    gpuContextRef.current?.paramsBuffer.write({ distortion, scale })
  }, [distortion, scale])

  return (
    <div className="flex flex-col items-center gap-4 pt-8">
      <Slider label="Vignette" value={vignette} onChange={setVignette} max={2} step={0.01} />
      <Slider label="Lens Distortion" value={distortion} onChange={setDistortion} min={-5} max={5} step={0.01} />
      <Slider label="Scale" value={scale} onChange={setScale} min={0.1} max={3} step={0.01} />
      <div className="relative w-[800px] h-[450px]">
        <video
          ref={videoRef}
          className="opacity-0 absolute inset-0 pointer-events-none"
          src="./roy.mp4"
          playsInline
          muted
          autoPlay
          loop
        />
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="w-full h-full" />
        {/* vignette */}
        {vignette > 0 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, transparent ${(1 - vignette) * 70}%, black ${100 - vignette * 30}%)`,
            }}
          />
        )}
      </div>
    </div>
  );
}
