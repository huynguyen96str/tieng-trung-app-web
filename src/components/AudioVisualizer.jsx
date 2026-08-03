import React, { useEffect, useRef } from 'react';
import './AudioVisualizer.css';

export const AudioVisualizer = ({ isRecording }) => {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    if (isRecording) {
      startVisualizer();
    } else {
      stopVisualizer();
    }
    return () => stopVisualizer();
  }, [isRecording]);

  const startVisualizer = async () => {
    try {
      // 1. Get access to the microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // 2. Setup AudioContext and Analyser
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64; // Small size for fewer, thicker bars
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      // 3. Start drawing loop
      draw();
    } catch (err) {
      console.error("Lỗi khi xin quyền Mic vẽ visualizer: ", err);
    }
  };

  const stopVisualizer = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Calculate bar dimensions
    const barWidth = (width / bufferLength) * 2;
    let x = 0;
    
    for(let i = 0; i < bufferLength; i++) {
      // Scale data (0-255) to fit canvas height
      const rawHeight = (dataArray[i] / 255) * height;
      const barHeight = Math.max(rawHeight, 2); // Minimum height of 2px
      
      // Create Gradient (Red to Orange)
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#F6AD55'); // bottom (orange)
      gradient.addColorStop(1, '#E53E3E'); // top (red)
      
      ctx.fillStyle = gradient;
      
      // Draw rounded bar (simulated with standard fillRect + arc if needed, but fillRect is faster)
      // For modern look, we'll draw paths with rounded tops
      ctx.beginPath();
      ctx.roundRect(x, height - barHeight, barWidth - 2, barHeight, [4, 4, 0, 0]);
      ctx.fill();
      
      x += barWidth;
    }
    
    requestRef.current = requestAnimationFrame(draw);
  };

  return (
    <div className="audio-visualizer-wrapper" style={{ display: isRecording ? 'block' : 'none' }}>
      <canvas ref={canvasRef} width="100" height="40" />
    </div>
  );
};
