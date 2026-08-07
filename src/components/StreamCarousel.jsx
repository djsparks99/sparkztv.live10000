import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, Radio, Play, Award, Volume2, ArrowRight, Bell } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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
      <div className="relative mx-auto max-w-[1440px] px-6 pt-8 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-[#1a1a1e] pb-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#e5ff00]">// NETWORK TRANSMISSIONS</div>
            <h1 className="mt-1 font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl lg:text-4xl">
              FEATURED BROADCASTS // <span className="text-[#e5ff00] font-sans italic">LIVE FEED</span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
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
          <div className="border border-dashed border-[#27272a] bg-[#09090b]/40 p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(229,255,0,0.03),transparent_60%)] pointer-events-none" />
            <div className="relative z-10 flex flex-col items-center">
              {/* Premium dark-themed cyber transmitter SVG illustration */}
              <svg width="140" height="140" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-4">
                {/* Cyber Grid background circle */}
                <circle cx="50" cy="50" r="48" stroke="#1f1f23" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx="50" cy="50" r="36" stroke="#141417" strokeWidth="1" />
                <circle cx="50" cy="50" r="24" stroke="#141417" strokeWidth="1" />
                
                {/* Crosshairs */}
                <line x1="50" y1="2" x2="50" y2="98" stroke="#161619" strokeWidth="0.5" />
                <line x1="2" y1="50" x2="98" y2="50" stroke="#161619" strokeWidth="0.5" />

                {/* Outer Signal Waves */}
                <path d="M25 45 C30 35, 70 35, 75 45" stroke="#27272a" strokeWidth="1.5" strokeLinecap="round" className="animate-pulse" />
                <path d="M20 40 C30 25, 70 25, 80 40" stroke="#27272a" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 2" />
                
                {/* Neon Active Signal Waves */}
                <path d="M30 50 C35 42, 65 42, 70 50" stroke="#e5ff00" strokeWidth="2" strokeLinecap="round" className="animate-pulse" opacity="0.8" />
                <path d="M35 55 C38 50, 62 50, 65 55" stroke="#e5ff00" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />

                {/* Cyber Tower / Antenna structure */}
                {/* Base stand */}
                <path d="M40 85 L44 72 L56 72 L60 85" stroke="#3f3f46" strokeWidth="2" strokeLinejoin="round" />
                <path d="M44 72 L47 55 L53 55 L56 72" stroke="#52525b" strokeWidth="1.5" strokeLinejoin="round" />
                <line x1="44" y1="72" x2="56" y2="72" stroke="#52525b" strokeWidth="1" />
                <line x1="47" y1="55" x2="53" y2="55" stroke="#71717a" strokeWidth="1" />

                {/* Cross beams inside tower */}
                <line x1="40" y1="85" x2="56" y2="72" stroke="#27272a" strokeWidth="1" />
                <line x1="60" y1="85" x2="44" y2="72" stroke="#27272a" strokeWidth="1" />
                <line x1="44" y1="72" x2="53" y2="55" stroke="#27272a" strokeWidth="1" />
                <line x1="56" y1="72" x2="47" y2="55" stroke="#27272a" strokeWidth="1" />

                {/* Main transmitter rod and emitter bulb */}
                <line x1="50" y1="55" x2="50" y2="35" stroke="#e5ff00" strokeWidth="2" strokeLinecap="round" />
                <circle cx="50" cy="35" r="4" fill="#000" stroke="#e5ff00" strokeWidth="2.5" className="animate-ping origin-center" style={{ transformOrigin: "50px 35px" }} />
                <circle cx="50" cy="35" r="3" fill="#e5ff00" />
                <circle cx="50" cy="35" r="1" fill="#fff" />
                
                {/* Status indicator glitch line at the bottom */}
                <rect x="35" y="88" width="30" height="2" fill="#18181b" rx="1" />
                <circle cx="50" cy="89" r="1.5" fill="#ef4444" className="animate-pulse" />
              </svg>
              <div className="font-display text-lg font-black uppercase tracking-wider text-zinc-400">
                // NO ACTIVE TRANSMISSIONS
              </div>
              <p className="mt-2 font-mono text-[10px] text-zinc-500 uppercase tracking-widest max-w-md mx-auto">
                The underground network is currently standby. Broadcast your own stream to go live.
              </p>
              <div className="mt-6">
                <Link 
                  to="/register" 
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#e5ff00] bg-[#e5ff00]/5 text-[#e5ff00] font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-[#e5ff00] hover:text-black transition-all"
                >
                  <span>START BROADCASTING</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
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
