import { useEffect, useState } from "react";

export default function FloatingReactions({ position = "right" }) {
  const [reactions, setReactions] = useState([]);

  useEffect(() => {
    const handleReaction = (e) => {
      const { reaction } = e.detail;
      const id = `${Date.now()}-${Math.random()}`;
      
      // Randomize initial horizontal position and wobble to create organic floating
      const randomLeft = position === "right" 
        ? 70 + Math.random() * 25 // 70% to 95%
        : position === "left"
        ? 5 + Math.random() * 25 // 5% to 30%
        : 10 + Math.random() * 80; // full width 10% to 90%
        
      const randomWobble = (Math.random() - 0.5) * 60; // -30px to 30px
      const randomScale = 0.8 + Math.random() * 0.5; // 0.8 to 1.3
      const duration = 2 + Math.random() * 1; // 2s to 3s

      const newReaction = {
        id,
        emoji: reaction,
        left: randomLeft,
        wobble: randomWobble,
        scale: randomScale,
        duration,
      };

      setReactions((prev) => [...prev.slice(-30), newReaction]); // Keep max 30 in DOM at once for performance
    };

    window.addEventListener("stream-reaction", handleReaction);
    return () => {
      window.removeEventListener("stream-reaction", handleReaction);
    };
  }, [position]);

  // Clean up completed reactions
  useEffect(() => {
    if (reactions.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setReactions((prev) =>
        prev.filter((r) => {
          const timestamp = parseFloat(r.id.split("-")[0]);
          return now - timestamp < r.duration * 1000;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [reactions]);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      <style>{`
        @keyframes float-drift {
          0% {
            transform: translateY(110%) scale(0.3);
            opacity: 0;
          }
          10% {
            transform: translateY(100%) scale(var(--scale));
            opacity: 0.95;
          }
          90% {
            opacity: 0.95;
          }
          100% {
            transform: translateY(-250px) scale(var(--scale)) translateX(var(--wobble));
            opacity: 0;
          }
        }
        .animate-float-reaction {
          animation: float-drift var(--duration) cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
      `}</style>
      
      {reactions.map((r) => (
        <span
          key={r.id}
          className="absolute bottom-4 text-2xl select-none animate-float-reaction filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]"
          style={{
            left: `${r.left}%`,
            "--wobble": `${r.wobble}px`,
            "--scale": r.scale,
            "--duration": `${r.duration}s`,
          }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
