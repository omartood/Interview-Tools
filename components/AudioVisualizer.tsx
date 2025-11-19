import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  volume: number; // 0 to 1
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ volume, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const bars = 5;
    const spacing = 6;
    const width = 8;
    
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (!isActive) return;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      ctx.fillStyle = '#38bdf8'; // Sky 400

      for (let i = 0; i < bars; i++) {
        // Calculate height based on volume and some sine wave movement for aliveness
        const offset = (i - (bars - 1) / 2);
        const x = centerX + offset * (width + spacing);
        
        // Base height plus volume modulation
        const h = 10 + (volume * 80 * Math.random()); 
        const y = centerY - h / 2;

        ctx.beginPath();
        ctx.roundRect(x - width/2, y, width, h, 4);
        ctx.fill();
      }
      
      animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [volume, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      width={100} 
      height={60} 
      className="opacity-90"
    />
  );
};

export default AudioVisualizer;