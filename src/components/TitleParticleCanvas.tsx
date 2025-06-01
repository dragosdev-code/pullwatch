import { useState, useEffect, useRef } from 'react';
import type { Particle } from './types';
import { arcColors } from './types';

interface TitleParticleCanvasProps {
  onComplete: () => void;
}

export const TitleParticleCanvas = ({ onComplete }: TitleParticleCanvasProps) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  // Create particles for title
  useEffect(() => {
    const createParticles = () => {
      const newParticles: Particle[] = [];
      const particleCount = 30 + Math.floor(Math.random() * 20); // 30-50 particles

      // Title area dimensions
      const titleWidth = 200; // Width around title
      const titleHeight = 30; // Height around title
      const centerX = 100; // Left side of container for title
      const centerY = 20; // Center of header height

      for (let i = 0; i < particleCount; i++) {
        // Stagger particles over time
        const staggerDelay = (i / particleCount) * 300;

        // Start particles around the title area
        const startX = centerX + (Math.random() - 0.5) * titleWidth;
        const startY = centerY + (Math.random() - 0.5) * titleHeight;

        // Move in random directions for sparkle effect
        const speed = 1 + Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        newParticles.push({
          id: Math.random(),
          x: startX,
          y: startY,
          vx: vx,
          vy: vy,
          life: staggerDelay,
          maxLife: 600 + Math.random() * 400,
          phase: 'burst',
          color: arcColors[Math.floor(Math.random() * arcColors.length)],
          size: 1 + Math.random() * 2,
          opacity: 0,
          centerX,
          centerY,
          angle: Math.random() * Math.PI * 2,
          orbitRadius: 1, // Mark as sparkle
        });
      }

      setParticles(newParticles);
    };

    createParticles();
  }, []);

  // Particle animation logic
  useEffect(() => {
    if (particles.length === 0) return;

    const animate = () => {
      setParticles((prev) => {
        const updatedParticles = prev
          .map((particle) => {
            const newParticle = { ...particle };
            newParticle.life += 16;

            const lifeProgress = newParticle.life / newParticle.maxLife;

            // Phase transitions
            if (lifeProgress < 0.3) {
              newParticle.phase = 'burst';
            } else if (lifeProgress < 0.7) {
              newParticle.phase = 'drift';
            } else {
              newParticle.phase = 'fade';
            }

            // Phase-specific behavior for sparkle effect
            switch (newParticle.phase) {
              case 'burst': {
                const burstEase = Math.min(1, lifeProgress * 4);
                newParticle.vx *= 0.98;
                newParticle.vy *= 0.98;
                newParticle.angle += 0.4;
                newParticle.x += newParticle.vx;
                newParticle.y += newParticle.vy;
                newParticle.opacity = burstEase * 1.2;
                break;
              }

              case 'drift': {
                newParticle.vx *= 0.96;
                newParticle.vy *= 0.96;
                newParticle.angle += 0.3;
                newParticle.x += newParticle.vx;
                newParticle.y += newParticle.vy;
                newParticle.opacity = 1.0;
                break;
              }

              case 'fade': {
                const fadeProgress = (lifeProgress - 0.7) / 0.3;
                newParticle.vx *= 0.94;
                newParticle.vy *= 0.94;
                newParticle.angle += 0.2;
                newParticle.x += newParticle.vx;
                newParticle.y += newParticle.vy;
                newParticle.opacity = (1 - fadeProgress) * 1.0;
                newParticle.size *= 0.98;
                break;
              }
            }

            return newParticle;
          })
          .filter((particle) => particle.life < particle.maxLife && particle.opacity > 0.01);

        // Check if animation is complete
        if (updatedParticles.length === 0) {
          onComplete();
          return [];
        }

        return updatedParticles;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== undefined) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [particles, onComplete]);

  // Render particles with sparkle effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || particles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((particle) => {
      ctx.save();
      ctx.globalAlpha = particle.opacity;

      // Draw sparkle/star effect
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.angle);

      // White sparkle center
      ctx.fillStyle = 'rgba(255, 255, 255, ' + particle.opacity + ')';
      ctx.fillRect(-particle.size, -0.5, particle.size * 2, 1);
      ctx.fillRect(-0.5, -particle.size, 1, particle.size * 2);

      // Add colored glow around spark
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, particle.size * 2);
      gradient.addColorStop(0, 'rgba(255, 255, 255, ' + particle.opacity * 0.8 + ')');
      gradient.addColorStop(
        0.3,
        particle.color +
          Math.floor(particle.opacity * 127)
            .toString(16)
            .padStart(2, '0')
      );
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }, [particles]);

  return (
    <canvas
      ref={canvasRef}
      width={380}
      height={50}
      className="absolute inset-0 pointer-events-none z-10"
    />
  );
};
