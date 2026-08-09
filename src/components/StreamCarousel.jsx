import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Radio, Play, Award, Volume2, ArrowRight, Bell, Copy, Disc, ExternalLink, HelpCircle, Server, Sparkles, Zap, Shield } from "lucide-react";
import { fileUrl, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import HlsPlayer from "@/components/HlsPlayer";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, deleteDoc, query, where, onSnapshot } from "firebase/firestore";

const FALLBACK_THUMBS = [
  "https://images.unsplash.com/photo-1541126274323-dbac58d14741?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHw0fHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1496337589254-7e19d01cec44?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwzfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1574169208507-84376144848b?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"
];

function hashPick(str, arr) {
  if (!str) return arr[0];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

function LazyThumbnail({ src, alt, className, referrerPolicy }) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "200px", // pre-load images 200px before they enter the viewport
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="h-full w-full bg-zinc-950 relative overflow-hidden">
      {isIntersecting && (
        <img
          src={src}
          alt={alt}
          referrerPolicy={referrerPolicy}
          onLoad={() => setIsLoaded(true)}
          className={`${className} transition-all ${isLoaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {!isLoaded && (
        <div className="absolute inset-0 bg-zinc-950 animate-pulse" />
      )}
    </div>
  );
}

export default function StreamCarousel({ allChannels = [], channels = [], isLoading = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scrollContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [subscribedBroadcasters, setSubscribedBroadcasters] = useState([]); // Array of lowercased usernames



  // Listen to the user's live notification subscriptions in Firestore
  useEffect(() => {
    if (!user?.uid) {
      setSubscribedBroadcasters([]);
      return;
    }

    const q = query(
      collection(db, "subscriptions"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.broadcaster_username) {
          subs.push(data.broadcaster_username.toLowerCase());
        }
      });
      setSubscribedBroadcasters(subs);
    }, (err) => {
      console.warn("Failed to listen to subscriptions:", err);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const channelsList = (allChannels && allChannels.length > 0) ? allChannels : channels;

  // Filter channels to remove generic / empty names and select ONLY live ones
  const seenUsernames = new Set();
  const carouselItems = (channelsList || []).filter((c) => {
    if (!c) return false;
    const username = (c.username || "").trim().toLowerCase();
    if (!username || username === "undefined" || username === "channel" || username === "null") {
      return false;
    }
    if (seenUsernames.has(username)) return false;
    seenUsernames.add(username);
    return Boolean(c.is_live || c.isLive);
  });

  const [streamCredentials, setStreamCredentials] = useState(null);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [isCopyingServer, setIsCopyingServer] = useState(false);
  const [isCopyingKey, setIsCopyingKey] = useState(false);

  useEffect(() => {
    if (user && carouselItems.length === 0) {
      api.post("/stream/create")
        .then(({ data }) => setStreamCredentials(data))
        .catch((err) => console.warn("Failed to fetch stream credentials:", err));
    }
  }, [user, carouselItems.length]);

  const handleToggleNotification = async (e, channel) => {
    // Prevent navigating to the channel detail page when clicking the toggle inside the card
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      toast.error("Please log in to sign up for notifications.", {
        description: "You need an account to track subscriptions.",
      });
      navigate("/login");
      return;
    }

    const slug = (channel.username || channel.channel_id || channel.id || "channel").toLowerCase();
    const isSubbed = subscribedBroadcasters.includes(slug);
    const subId = `${user.uid}_${slug}`;
    const subRef = doc(db, "subscriptions", subId);

    try {
      if (isSubbed) {
        await deleteDoc(subRef);
        toast.success(`Notifications disabled for @${slug}`);
      } else {
        await setDoc(subRef, {
          id: subId,
          userId: user.uid,
          broadcaster_username: slug,
          broadcaster_display_name: channel.display_name || slug,
          created_at: new Date().toISOString(),
          active: true
        });
        toast.success(`Notifications enabled! We'll ping you when @${slug} goes live.`);
      }
    } catch (err) {
      console.error("Failed to toggle subscription:", err);
      toast.error("Subscription failed. Please check rules or connection.");
    }
  };

  // Calculate total viewers (live channels only)
  const totalLiveViewers = carouselItems
    .reduce((sum, c) => sum + Number(c.viewer_count || c.viewerCount || c.views || 0), 0);

  // Update button visibility on scroll
  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      // Run once on load
      checkScroll();
      // Handle resize
      window.addEventListener("resize", checkScroll);
    }
    return () => {
      if (el) el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [carouselItems.length]);

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = 420; // Width of cards + gap
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  // Touch gesture state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    // Reset end coords
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    const diffX = touchStartX.current - touchEndX.current;
    const diffY = touchStartY.current - touchEndY.current;

    // Detect horizontal swipe with minimum threshold (50px) and angle (more horizontal than vertical)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0) {
        // Swiped left, slide to the right
        scroll("right");
      } else {
        // Swiped right, slide to the left
        scroll("left");
      }
    }
  };

  return (
    <section 
      id="stream-carousel"
      className="relative border-b border-[#1c1c1f] bg-[#030303] text-white overflow-hidden select-none"
      data-testid="stream-carousel"
    >
      {/* Decorative Grid Lines with Neon Accents */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#141416_1px,transparent_1px),linear-gradient(to_bottom,#141416_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* Header Container */}
      <div className="relative mx-auto max-w-[1440px] px-6 pt-8 pb-4 flex flex-col items-center">
        {/* Centered Bannersnack Leaderboard Ad Container */}
        <div className="w-full flex flex-col items-center justify-center mb-6">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#e5ff00]/60 mb-2 text-center">// SPARKZ BROADCAST NETWORK // AD TRANSMISSION</div>
          <div className="w-full max-w-[728px] overflow-x-auto scrollbar-none flex justify-center">
            <div 
              id="bannersnack-embed-container" 
              className="w-[728px] h-[90px] shrink-0 bg-[#050507] border border-[#1c1c1f] shadow-[0_0_20px_rgba(0,0,0,0.8)] relative overflow-hidden"
            >
              <iframe
                src="//cdn.bannersnack.com/banners/bdun0xvdy/embed/index.html?userId=35786041&t=1786233694"
                width="100%"
                height="100%"
                scrolling="no"
                frameBorder="0"
                allow="autoplay"
                allowFullScreen={true}
                title="Sparkz Ad Banner"
                className="w-full h-full"
                style={{ border: "none", overflow: "hidden" }}
              />
            </div>
          </div>
        </div>

        {/* Lower Header Controls & Status */}
        <div className="w-full flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-[#1a1a1e] pt-4">
          {/* Left: High-energy terminal subgenre badge ticker */}
          <div className="flex-1 max-w-xl">
            <div className="flex items-center gap-3 overflow-hidden border border-[#e5ff00]/15 bg-[#050507] px-3.5 py-1.5 font-mono text-[10px] tracking-wider text-[#e5ff00] rounded-none shadow-[inset_0_0_10px_rgba(229,255,0,0.02)]">
              <span className="shrink-0 bg-[#e5ff00] text-black px-1.5 py-0.5 font-black text-[8px] uppercase tracking-widest flex items-center gap-1">
                <span className="h-1 w-1 bg-black rounded-full animate-pulse" />
                SYSTEM GENRES
              </span>
              <div className="relative flex flex-1 overflow-hidden select-none">
                <div className="flex w-max animate-marquee space-x-6 whitespace-nowrap">
                  {["JUNGLE", "DRUM & BASS", "UK GARAGE", "DUBSTEP", "GRIME", "BASSLINE", "BREAKCORE", "SPEED GARAGE", "TECHNO", "SOUND SYSTEM"].map((genre, index) => (
                    <span key={index} className="flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-widest text-[#e5ff00]">
                      <span>{genre}</span>
                      <span className="text-zinc-700">//</span>
                    </span>
                  ))}
                  {/* Repeated for continuous loop */}
                  {["JUNGLE", "DRUM & BASS", "UK GARAGE", "DUBSTEP", "GRIME", "BASSLINE", "BREAKCORE", "SPEED GARAGE", "TECHNO", "SOUND SYSTEM"].map((genre, index) => (
                    <span key={`dup-${index}`} className="flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-widest text-[#e5ff00]">
                      <span>{genre}</span>
                      <span className="text-zinc-700">//</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Active Viewers & Navigation Scroll Buttons */}
          <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
            {isLoading ? (
              <div className="flex items-center gap-2 border border-[#27272a] bg-[#09090b] px-3.5 py-2 font-mono text-[10px] text-zinc-300">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#e5ff00] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#e5ff00]" />
                </span>
                <span className="font-bold text-[#e5ff00] animate-pulse">SCANNING FOR SIGNALS...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 border border-[#27272a] bg-[#09090b] px-3.5 py-2 font-mono text-[10px] text-zinc-300">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                <span className="font-bold text-white">{totalLiveViewers} VIEWERS ACTIVE</span>
              </div>
            )}

            {/* Scroll buttons on the top right */}
            {carouselItems.length > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => scroll("left")}
                  disabled={!canScrollLeft}
                  className={`h-9 w-9 flex items-center justify-center border border-[#27272a] bg-[#09090b] text-zinc-400 hover:text-[#e5ff00] hover:border-[#e5ff00] disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:border-[#27272a] transition-all`}
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => scroll("right")}
                  disabled={!canScrollRight}
                  className={`h-9 w-9 flex items-center justify-center border border-[#27272a] bg-[#09090b] text-zinc-400 hover:text-[#e5ff00] hover:border-[#e5ff00] disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:border-[#27272a] transition-all`}
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Scoped CSS for Shimmer Animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer-slide {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer-slide {
          animation: shimmer-slide 1.6s infinite ease-in-out;
        }
      ` }} />

      {/* Horizontal Sliding Carousel Container, Skeleton Screens, or Empty State */}
      {isLoading && carouselItems.length === 0 ? (
        <div className="relative mx-auto max-w-[1440px] px-6 py-6 overflow-visible" data-testid="carousel-loading-skeletons">
          <div 
            className="flex gap-6 overflow-x-auto scrollbar-none pb-4"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {[1, 2, 3].map((num) => (
              <div 
                key={`carousel-skeleton-${num}`}
                className="shrink-0 w-[310px] sm:w-[360px] md:w-[400px] border border-[#1a1a1d] bg-[#070709] flex flex-col relative overflow-hidden"
              >
                {/* 16:9 Landscape Video Preview/Thumbnail Stage Skeleton */}
                <div className="relative aspect-[16/9] w-full bg-[#121215] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#1c1c22] to-transparent animate-shimmer-slide" />
                  
                  {/* Upper-Left Live Badge Placeholder */}
                  <div className="absolute left-3 top-3">
                    <div className="h-5 w-12 bg-[#1d1d21] animate-pulse" />
                  </div>

                  {/* Upper-Right Category Placeholder */}
                  <div className="absolute right-3 top-3">
                    <div className="h-5 w-16 bg-[#1d1d21] animate-pulse" />
                  </div>
                </div>

                {/* Stream Description & Broadcaster Metadata Body Skeleton */}
                <div className="p-4 flex gap-3 flex-1 min-h-[105px]">
                  <div className="shrink-0">
                    <div className="h-10 w-10 border border-[#1e1e21] bg-[#121215] animate-pulse" />
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col gap-2 justify-center">
                    {/* Title placeholder */}
                    <div className="h-4 w-3/4 bg-[#121215] animate-pulse" />
                    {/* Broadcaster + Username row placeholder */}
                    <div className="h-3 w-1/2 bg-[#121215] animate-pulse" />
                    {/* Bio placeholder */}
                    <div className="h-2.5 w-5/6 bg-[#121215] animate-pulse mt-0.5" />
                  </div>
                </div>

                {/* CTA Action Bar footer Skeleton */}
                <div className="p-4 pt-0 border-t border-[#121214] mt-auto flex items-center justify-between gap-2">
                  <div className="h-7 w-[80px] bg-[#121215] border border-[#1a1a1d] animate-pulse" />
                  <div className="h-3 w-20 bg-[#121215] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : carouselItems.length === 0 ? (
        <div className="relative mx-auto max-w-[1440px] px-6 py-12" data-testid="carousel-empty-state">
          <div className="border border-[#27272a] bg-[#070709] p-6 sm:p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(229,255,0,0.02),transparent_60%)] pointer-events-none" />
            <div className="absolute top-0 right-0 p-3 font-mono text-[8px] text-zinc-600 tracking-widest select-none">// SYSTEM MODULE: standby_v0.9.1</div>
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              
              {/* Column 1: Sound System Wall & Spinning Vinyl Deck (col-span-5) */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center border border-[#1c1c1f] bg-black/60 p-6 relative overflow-hidden select-none group">
                {/* Speaker Grill Grid behind */}
                <div className="absolute inset-0 bg-[radial-gradient(#141417_1px,transparent_1px)] [background-size:12px_12px] opacity-40 pointer-events-none" />
                
                {/* 3D Speaker Wall Aesthetic / Neon VU meter */}
                <div className="w-full flex items-center justify-between mb-4 px-2 font-mono text-[8px] text-zinc-500">
                  <span>DECK: A // STANDBY</span>
                  <div className="flex gap-0.5 items-center">
                    <span className="h-1.5 w-1 bg-[#e5ff00] animate-pulse" />
                    <span className="h-2 w-1 bg-[#e5ff00]" />
                    <span className="h-3 w-1 bg-[#e5ff00] animate-pulse" />
                    <span className="h-1.5 w-1 bg-zinc-800" />
                    <span className="h-1 w-1 bg-zinc-800" />
                  </div>
                </div>

                {/* Pulsing Subwoofer and Spinning Vinyl Record Wrapper */}
                <div className="relative h-44 w-44 flex items-center justify-center">
                  {/* Outer speaker ring / glowing ripple */}
                  <div className="absolute inset-0 rounded-full border border-[#e5ff00]/10 animate-ping opacity-25" />
                  <div className="absolute inset-2 rounded-full border border-zinc-800 bg-[#0c0c0e] shadow-[0_0_20px_rgba(229,255,0,0.03)]" />
                  
                  {/* Spinning Vinyl Record */}
                  <div className="relative h-32 w-32 rounded-full bg-[#111113] border-4 border-[#1c1c1f] flex items-center justify-center animate-[spin_8s_linear_infinite] group-hover:animate-[spin_2s_linear_infinite] transition-all duration-300 shadow-2xl cursor-pointer">
                    {/* Vinyl grooves lines */}
                    <div className="absolute inset-2 rounded-full border border-black/40" />
                    <div className="absolute inset-4 rounded-full border border-black/40" />
                    <div className="absolute inset-6 rounded-full border border-black/40" />
                    <div className="absolute inset-8 rounded-full border border-black/40" />
                    <div className="absolute inset-10 rounded-full border border-black/40" />
                    
                    {/* Vinyl center sticker label */}
                    <div className="h-10 w-10 rounded-full bg-[#e5ff00] flex items-center justify-center p-1 text-center shadow-md border-2 border-black">
                      <Disc className="h-4 w-4 text-black animate-spin" />
                    </div>
                  </div>

                  {/* Tonearm overlay */}
                  <svg className="absolute top-2 right-2 w-16 h-24 text-zinc-400 select-none pointer-events-none drop-shadow-lg" viewBox="0 0 64 96" fill="none">
                    <path d="M52 10 L52 30 L20 70" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="52" cy="10" r="4" fill="#ef4444" />
                    <rect x="14" y="66" width="12" height="8" rx="1" fill="#27272a" stroke="currentColor" strokeWidth="1" />
                  </svg>
                </div>

                {/* Sub-bass power grid */}
                <div className="mt-4 text-center">
                  <div className="font-display text-sm font-black uppercase tracking-widest text-[#e5ff00] flex items-center gap-1.5 justify-center">
                    <span className="h-2 w-2 rounded-full bg-[#e5ff00] animate-ping" />
                    SPARKZ SUB-01 ACTIVE
                  </div>
                  <p className="mt-1 font-mono text-[8px] text-zinc-500 uppercase tracking-widest">
                    Pulsing live sound system standby // Hover to spin vinyl faster
                  </p>
                </div>

                {/* Interactive dub horn/hype siren button */}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const AudioContext = window.AudioContext || window.webkitAudioContext;
                      if (!AudioContext) return;
                      const ctx = new AudioContext();
                      const osc = ctx.createOscillator();
                      const gainNode = ctx.createGain();
                      osc.type = "sawtooth";
                      osc.frequency.setValueAtTime(140, ctx.currentTime);
                      osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 0.3);
                      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.6);
                      osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 0.9);
                      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 1.2);
                      gainNode.gain.setValueAtTime(0, ctx.currentTime);
                      gainNode.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.1);
                      gainNode.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.0);
                      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
                      osc.connect(gainNode);
                      gainNode.connect(ctx.destination);
                      osc.start();
                      osc.stop(ctx.currentTime + 1.2);
                      toast.success("🚨 SOUNDSYSTEM SIREN TRIGGERED! // HEAVYWEIGHT SIGNALS");
                    } catch (e) {
                      console.warn(e);
                    }
                  }}
                  className="mt-5 inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#e5ff00]/30 bg-black hover:border-[#e5ff00] hover:bg-[#e5ff00]/10 text-[#e5ff00] font-mono text-[9px] font-bold uppercase tracking-wider transition-all"
                >
                  <Volume2 className="h-3.5 w-3.5 animate-bounce" />
                  <span>TRIGGER HYPE SIREN 🚨</span>
                </button>
              </div>
                       {/* Column 2: DJ Quick Start Guide OBS Terminal */}
              <div className="lg:col-span-7 flex flex-col justify-between border border-[#1c1c1f] bg-[#0a0a0d] p-5 sm:p-6 font-mono text-xs">
                {/* Terminal Header */}
                <div className="border-b border-[#1c1c1f] pb-3 mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#e5ff00] font-bold">
                    <Sparkles className="h-4 w-4 animate-pulse text-[#e5ff00]" />
                    <span>// CREATOR BENEFITS // CLAIM YOUR FREQUENCY</span>
                  </div>
                  <span className="text-[9px] text-[#e5ff00]/60 uppercase tracking-widest hidden sm:inline">PERKS v1.0</span>
                </div>

                {/* Perks Content */}
                <div className="space-y-4 flex-1">
                  <p className="text-zinc-400 text-[11px] leading-relaxed mb-2 font-mono">
                    We built <span className="text-[#e5ff00] font-bold">SPARKZ.TV</span> specifically for underground music curators, sound-system crews, and independent DJs. No algorithmic suppression. No DMCA muted VODs. Just pure high-fidelity transmission.
                  </p>

                  <div className="grid grid-cols-1 gap-3">
                    {/* Perk 1: Vinyl Bits */}
                    <div className="bg-black/40 border border-[#1c1c1f]/60 p-3 flex items-start gap-3 hover:border-[#e5ff00]/20 transition-colors">
                      <div className="bg-[#e5ff00]/5 p-2 border border-[#e5ff00]/20 rounded-none shrink-0 text-[#e5ff00]">
                        <Disc className="h-4 w-4 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[#e5ff00] font-extrabold text-[10px] uppercase tracking-wider">
                          100% TIP EARNINGS VIA VINYL BITS
                        </div>
                        <p className="text-zinc-500 text-[10px] leading-relaxed uppercase">
                          Keep 100% of your support. Our micro-tipping system lets your community drop custom bits straight into your live mix.
                        </p>
                      </div>
                    </div>

                    {/* Perk 2: Copyright preservation */}
                    <div className="bg-black/40 border border-[#1c1c1f]/60 p-3 flex items-start gap-3 hover:border-[#e5ff00]/20 transition-colors">
                      <div className="bg-[#e5ff00]/5 p-2 border border-[#e5ff00]/20 rounded-none shrink-0 text-[#e5ff00]">
                        <Shield className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[#e5ff00] font-extrabold text-[10px] uppercase tracking-wider">
                          COPYRIGHT-FRIENDLY SOUND SYSTEM CULTURE
                        </div>
                        <p className="text-zinc-500 text-[10px] leading-relaxed uppercase">
                          Streaming should be free of corporate filters. We protect your underground mixes from aggressive automated takedowns.
                        </p>
                      </div>
                    </div>

                    {/* Perk 3: Instant Setup */}
                    <div className="bg-black/40 border border-[#1c1c1f]/60 p-3 flex items-start gap-3 hover:border-[#e5ff00]/20 transition-colors">
                      <div className="bg-[#e5ff00]/5 p-2 border border-[#e5ff00]/20 rounded-none shrink-0 text-[#e5ff00]">
                        <Zap className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[#e5ff00] font-extrabold text-[10px] uppercase tracking-wider">
                          60-SECOND INSTANT SETUP
                        </div>
                        <p className="text-zinc-500 text-[10px] leading-relaxed uppercase">
                          Direct RTMP/WHIP stream keys. Fire up OBS, Rekordbox, or Traktor and transmit live in high-fidelity 1080p stereo.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTAs Footer Row */}
                <div className="border-t border-[#1c1c1f] pt-4 mt-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                  
                  {/* Left Link for FAQ or Docs */}
                  <Link
                    to="/directory"
                    className="inline-flex items-center gap-1 text-[9px] text-zinc-500 hover:text-[#e5ff00] uppercase tracking-widest font-bold"
                  >
                    <span>Browse Active Channels</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>

                  {/* Primary & Secondary Action Button block */}
                  <div className="flex gap-2">
                    <Link
                      to={user ? `/channel/${user.username || "djsparkz"}` : "/register"}
                      className="btn-primary px-6 py-2.5 text-[10px] flex items-center justify-center gap-1.5 font-bold tracking-widest bg-[#e5ff00] text-black hover:bg-white transition-colors"
                    >
                      <span>{user ? "ENTER CREATOR DASHBOARD" : "CLAIM YOUR FREQUENCY (SIGN UP FREE)"}</span>
                      <ArrowRight className="h-4 w-4 text-black" />
                    </Link>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`relative mx-auto max-w-[1440px] px-6 py-6 overflow-visible transition-opacity duration-300 ${isLoading ? "opacity-75 select-none pointer-events-none" : ""}`}>
          <div 
            ref={scrollContainerRef}
            className="flex gap-6 overflow-x-auto scrollbar-none scroll-smooth snap-x snap-mandatory pb-4"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {carouselItems.map((channel, idx) => {
              const isLive = Boolean(channel.is_live || channel.isLive);
              const slug = channel.username || channel.channel_id || channel.id || "channel";
              const views = Number(channel.viewer_count || channel.viewerCount || channel.views || 0);
              const isSubbed = subscribedBroadcasters.includes(slug.toLowerCase());

              // Resolve Thumbnail
              const thumbSrc = channel.thumbnail_url || channel.thumbnailUrl || channel.preview_image || channel.previewImage;
              const finalThumb = thumbSrc
                ? (thumbSrc.startsWith("http") ? thumbSrc : fileUrl(thumbSrc))
                : hashPick(slug, FALLBACK_THUMBS);

              // Resolve Avatar URL
              const isMe = user && (
                (user.uid && user.uid === channel.user_uid) ||
                (user.username && user.username.toLowerCase() === slug.toLowerCase())
              );
              const avatarUrl = channel.photo_url || 
                                channel.photoUrl || 
                                (channel.user && (channel.user.photo_url || channel.user.photoUrl)) ||
                                (isMe && (user?.photo_url || user?.photoUrl)) ||
                                `https://api.dicebear.com/7.x/bottts/png?seed=${slug}`;

              return (
                <div 
                  key={`${slug}-${idx}`}
                  onClick={(e) => {
                    if (e.target.closest("button") || e.target.closest("a")) {
                      return;
                    }
                    navigate(`/channel/${slug}`);
                  }}
                  className="snap-start shrink-0 w-[310px] sm:w-[360px] md:w-[400px] border border-[#1e1e21] bg-[#09090b] hover:border-[#e5ff00]/60 cursor-pointer transition-all duration-300 flex flex-col group relative overflow-hidden"
                >
                  {/* 16:9 Landscape Video Preview/Thumbnail Stage */}
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
                    <LazyThumbnail
                      src={finalThumb}
                      alt={channel.display_name || slug}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover duration-500 group-hover:scale-105"
                    />
                    
                    {/* Subtle dark bottom gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                    {/* Upper-Left Live Badge / Offline Standby Badge */}
                    <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 bg-red-600 px-2.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 font-mono text-[9px] font-bold text-zinc-400">
                          STANDBY
                        </span>
                      )}

                      {isLive && (
                        <span className="inline-flex items-center gap-1 bg-black/75 px-2.5 py-0.5 font-mono text-[9px] text-zinc-300">
                          <Eye className="h-3 w-3 text-[#e5ff00]" />
                          {views}
                        </span>
                      )}
                    </div>

                    {/* Upper-Right Category/Genre Tag */}
                    {channel.category && (
                      <div className="absolute right-3 top-3">
                        <span className="border border-[#e5ff00]/40 bg-black/80 text-[#e5ff00] font-mono text-[9px] uppercase tracking-widest px-2 py-0.5">
                          {channel.category}
                        </span>
                      </div>
                    )}

                    {/* Overlaid Play Button Indicator on Hover */}
                    <Link 
                      to={`/channel/${slug}`}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    >
                      <div className="h-12 w-12 rounded-full border border-[#e5ff00] bg-black/80 flex items-center justify-center text-[#e5ff00] shadow-[0_0_15px_rgba(229,255,0,0.3)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                        <Play className="h-5 w-5 fill-current ml-0.5" />
                      </div>
                    </Link>
                  </div>

                  {/* Stream Description & Broadcaster Metadata Body */}
                  <div className="p-4 flex gap-3 flex-1 min-h-[105px]">
                    <Link to={`/channel/${slug}`} className="shrink-0">
                      <img
                        src={avatarUrl.startsWith("http") ? avatarUrl : fileUrl(avatarUrl)}
                        alt={channel.display_name || slug}
                        className="h-10 w-10 border border-[#e5ff00]/40 group-hover:border-[#e5ff00] object-cover bg-black rounded-none transition-colors"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.target.src = `https://api.dicebear.com/7.x/bottts/png?seed=${slug}`;
                        }}
                      />
                    </Link>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-sm font-black text-white group-hover:text-[#e5ff00] transition-colors leading-snug truncate uppercase">
                        <Link to={`/channel/${slug}`}>
                          {isLive ? (channel.stream_title || "Live underground set") : "Static Signal — Standby"}
                        </Link>
                      </h3>
                      <div className="mt-1 flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
                        <span className="text-white font-bold">{channel.display_name || channel.username}</span>
                        <span>•</span>
                        <span className="text-zinc-500">@{slug}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-1 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">
                        {channel.bio || "Resident Frequency broadcaster."}
                      </p>
                    </div>
                  </div>

                  {/* CTA Action Bar footer */}
                  <div className="p-4 pt-0 border-t border-[#121214] mt-auto flex items-center justify-between gap-2">
                    <button
                      onClick={(e) => handleToggleNotification(e, channel)}
                      data-testid={`carousel-notify-${slug}`}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] font-bold uppercase transition-all duration-200 border ${
                        isSubbed 
                          ? "border-[#e5ff00] bg-[#e5ff00]/10 text-[#e5ff00] shadow-[0_0_10px_rgba(229,255,0,0.15)]" 
                          : "border-[#27272a] bg-black text-zinc-400 hover:text-white hover:border-zinc-500"
                      }`}
                    >
                      <Bell className={`h-3 w-3 ${isSubbed ? "fill-[#e5ff00]" : ""}`} />
                      <span>{isSubbed ? "NOTIFIED" : "NOTIFY ME"}</span>
                    </button>

                    <Link 
                      to={`/channel/${slug}`}
                      data-testid={`carousel-tune-in-${slug}`}
                      className="inline-flex items-center gap-1 text-[10px] font-bold font-mono uppercase tracking-wider text-[#e5ff00] hover:underline"
                    >
                      <span>{isLive ? "TUNE IN NOW" : "VIEW CHANNEL"}</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
