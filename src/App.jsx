import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import LiveSidebar from "@/components/LiveSidebar";
import UsernameLockModal from "@/components/UsernameLockModal";
import Footer from "@/components/Footer";
import Browse from "@/pages/Browse";
import Directory from "@/pages/Directory";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Channel from "@/pages/Channel";
import Dashboard from "@/pages/Dashboard";
import Profile from "@/pages/Profile";
import Payouts from "@/pages/Payouts";
import Lounge from "@/pages/Lounge";
import ObsOverlay from "@/pages/ObsOverlay";
import { useLivepeerAutoPoll } from "@/hooks/useLivepeerAutoPoll";

const SIDEBAR_STORAGE_KEY = "sparkz_sidebar_collapsed";

function ProtectedLayout() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-24">
        <div className="h-40 animate-pulse bg-[#0a0a0a]" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

function useSidebarCollapsed() {
  // Reflect the collapsed flag from LiveSidebar for main-content offset.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1"
  );
  useEffect(() => {
    const onStorage = () => {
      setCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("sidebar-toggle", onStorage);
    const t = setInterval(onStorage, 300);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sidebar-toggle", onStorage);
      clearInterval(t);
    };
  }, []);
  return collapsed;
}

function SiteLayout() {
  const { user } = useAuth();
  const collapsed = useSidebarCollapsed();
  useLivepeerAutoPoll();
  const sidebarWidthClass = collapsed ? "lg:pl-[60px]" : "lg:pl-[240px]";

  // If user is null (loaded but not authenticated), show the banner
  const showJoinBanner = user === null;

  return (
    <>
      <Navbar />
      <LiveSidebar />
      <div className={`${sidebarWidthClass} pt-16 ${showJoinBanner ? "pb-24 sm:pb-20" : ""} transition-all duration-300`}>
        <main className="relative z-10">
          <Outlet />
        </main>
        <Footer />
      </div>

      {showJoinBanner && (
        <div
          id="join-fixed-banner"
          className={`fixed bottom-0 left-0 right-0 z-40 border-t border-[#e5ff00]/80 bg-[#050505]/95 backdrop-blur-md px-4 py-4 sm:px-6 md:px-8 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] transition-all duration-300 ${sidebarWidthClass} animate-banner-slide`}
        >
          <div className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 self-start sm:self-center">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e5ff00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e5ff00]"></span>
              </span>
              <p className="font-mono text-xs sm:text-sm tracking-wider text-zinc-300">
                join <span className="text-[#e5ff00] font-bold">sparkz.TV</span> and discover the underground
              </p>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <Link
                to="/register"
                id="join-banner-btn"
                className="font-mono text-xs font-black uppercase tracking-widest bg-[#e5ff00] text-black border border-[#e5ff00] px-6 py-2.5 flex items-center justify-center gap-2 hover:bg-black hover:text-[#e5ff00] transition-all duration-300 shadow-[0_0_15px_rgba(229,255,0,0.15)] hover:shadow-[0_0_25px_rgba(229,255,0,0.3)] active:scale-95 w-full sm:w-auto"
              >
                <span>JOIN NOW</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}

export default function App() {
  useEffect(() => {
    // Force page title back after analytics script may overwrite it
    document.title = "Sparkz.TV — Underground Live Streaming";
  }, []);

  return (
    <AuthProvider>
      <UsernameLockModal />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/overlay/:username" element={<ObsOverlay />} />
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Browse />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/channel/:username" element={<Channel />} />
            <Route path="/lounge" element={<Lounge />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/payouts" element={<Payouts />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#050505",
            border: "1px solid #27272a",
            color: "#fff",
            borderRadius: 0,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          },
        }}
      />
    </AuthProvider>
  );
}
