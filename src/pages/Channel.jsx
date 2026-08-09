import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, collection, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import HlsPlayer from "@/components/HlsPlayer";
import ChatPanel from "@/components/ChatPanel";
import FollowButton from "@/components/FollowButton";
import SubscribeButton from "@/components/SubscribeButton";
import ShareButton from "@/components/ShareButton";
import SessionList from "@/components/SessionList";
import ScheduleDisplay from "@/components/ScheduleDisplay";
import LiveDuration from "@/components/LiveDuration";
import UserLocationTime from "@/components/UserLocationTime";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth-context";
import { Eye, ArrowLeft, User, Clock, QrCode, Coins, Flag } from "lucide-react";
import { useLivepeerAutoPoll } from "@/hooks/useLivepeerAutoPoll";
import { QRCodeSVG } from "qrcode.react";

const OperationType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LIST: "list",
  GET: "get",
  WRITE: "write",
};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function Channel() {
  const { username } = useParams();
  const { user } = useAuth();
  const [channel, setChannel] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please log in to submit a community moderation report.");
      return;
    }
    if (!reportReason) {
      toast.error("Please select a reason for reporting.");
      return;
    }

    setIsSubmittingReport(true);
    const pathForWrite = "moderation_reports";
    try {
      const reportRef = doc(collection(db, pathForWrite));
      const reportId = reportRef.id;

      const reportData = {
        id: reportId,
        reporter_uid: user.uid,
        reporter_username: user.username || "anonymous",
        reported_stream_id: channel.playback_id || "unknown",
        reported_username: channel.username,
        reason: reportReason,
        details: reportDetails.trim(),
        status: "pending",
        created_at: new Date().toISOString()
      };

      await setDoc(reportRef, reportData);
      toast.success("Flag submitted successfully.", {
        description: "Our moderation team has been notified."
      });
      setIsReportModalOpen(false);
      setReportReason("");
      setReportDetails("");
    } catch (error) {
      toast.error("Failed to submit report. Please try again.");
      handleFirestoreError(error, OperationType.WRITE, pathForWrite);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  useLivepeerAutoPoll(username);

  const isLive = Boolean(channel?.is_live || channel?.isLive);

  const channelImage = channel?.photo_url
    ? fileUrl(channel.photo_url)
    : channel?.banner_url
    ? fileUrl(channel.banner_url)
    : "/og-image.jpg";

  const channelTitle = channel
    ? `${channel.display_name || channel.username} (@${channel.username})`
    : `Broadcaster ${username}`;

  const channelDesc = channel
    ? channel.stream_title || channel.bio || `Watch ${channel.display_name || channel.username} live on Sparkz.TV`
    : `Watch underground live streams on Sparkz.TV`;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [username]);

  useEffect(() => {
    setNotFound(false);
    let cancelled = false;

    const load = async () => {
      if (!username || username === "undefined" || username === "null") {
        return;
      }
      try {
        const { data } = await api.get(`/channels/${username}`, {
          params: {
            uid: user?.uid || "",
            username: user?.username || ""
          },
          headers: {
            "x-user-uid": user?.uid || "",
            "x-username": user?.username || ""
          }
        });
        if (!cancelled && data) {
          let scheduleArray = [];
          if (Array.isArray(data.schedules)) {
            scheduleArray = data.schedules;
          } else if (Array.isArray(data.schedule)) {
            scheduleArray = data.schedule;
          } else if (data.schedule_json) {
            try {
              scheduleArray = JSON.parse(data.schedule_json);
            } catch (e) {}
          } else if (data.schedule) {
            scheduleArray = [data.schedule];
          }

          setChannel((prev) => ({
            ...data,
            schedule: scheduleArray.length > 0 ? scheduleArray : (prev?.schedule || []),
            photo_url: data.photo_url || prev?.photo_url || null,
          }));
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
    };
    load();

    const targetDocId = username ? username.toLowerCase() : "";
    const unsub = onSnapshot(
      doc(db, "channels", targetDocId),
      (docSnap) => {
        if (docSnap.exists() && !cancelled) {
          const fsData = docSnap.data();
          let fsSchedule = fsData.schedule;
          if (!Array.isArray(fsSchedule) && fsData.schedule_json) {
            try {
              fsSchedule = JSON.parse(fsData.schedule_json);
            } catch (e) {}
          }
          setChannel((prev) => {
            if (!prev) {
              return {
                ...fsData,
                schedule: Array.isArray(fsSchedule) ? fsSchedule : [],
              };
            }

            const merged = { ...prev };
            
            for (const key of Object.keys(fsData)) {
              if (fsData[key] !== null && fsData[key] !== undefined) {
                merged[key] = fsData[key];
              }
            }

            if (!merged.photo_url && prev.photo_url) {
              merged.photo_url = prev.photo_url;
            }

            const finalSchedule = (Array.isArray(fsSchedule) && fsSchedule.length > 0)
              ? fsSchedule
              : (prev.schedule || []);
            
            merged.schedule = finalSchedule;
            return merged;
          });
        }
      },
      (err) => {
        console.warn("Firestore channel snapshot notice:", err);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [username, user?.uid]);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    const beat = async () => {
      try {
        const { data } = await api.post(`/channels/${username}/view`);
        if (!cancelled && data && typeof data.viewer_count === "number") {
          setChannel((prev) =>
            prev ? { ...prev, viewer_count: data.viewer_count } : prev
          );
        }
      } catch {}
    };
    beat();
    const t = setInterval(beat, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isLive, username]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <div className="font-display text-6xl font-black tracking-tighter text-zinc-700">404</div>
        <div className="mt-2 font-mono text-sm uppercase tracking-widest text-zinc-500">
          NO SUCH FREQUENCY
        </div>
        <Link to="/" className="btn-primary mt-8 inline-flex">
          BACK TO GRID
        </Link>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-8">
        <div className="aspect-video animate-pulse bg-[#111]" />
      </div>
    );
  }

  const ownChannel = user?.username === channel.username;

  return (
    <div className="mx-auto max-w-[1440px] px-6 pt-6 pb-24 sm:pb-28 lg:pb-32" data-testid={`channel-page-${username}`}>
      <SEO
        title={channelTitle}
        description={channelDesc}
        image={channelImage}
        isLive={isLive}
        category={channel?.category}
        type="profile"
      />
      <Link
        to="/"
        data-testid="back-to-browse"
        className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-500 hover:text-white"
      >
        <ArrowLeft className="h-3 w-3" /> BACK TO SIGNALS
      </Link>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <HlsPlayer playbackId={channel.playback_id} isLive={isLive} />
            <div className="flex justify-end">
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 hover:text-red-400 transition-colors uppercase tracking-widest px-2 py-1"
                title="Report this broadcast for community guidelines violations"
              >
                <Flag className="h-3 w-3" />
                <span>Report Broadcast</span>
              </button>
            </div>
          </div>

          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isLive && (
                    <span className="live-badge">
                      <span className="dot live-dot" /> LIVE
                    </span>
                  )}
                  {isLive && channel.stream_started_at && (
                    <span
                      className="inline-flex items-center gap-1.5 border border-[#27272a] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-[#e5ff00]"
                      data-testid="live-duration-badge"
                    >
                      <Clock className="h-3 w-3" />
                      <LiveDuration startedAt={channel.stream_started_at} />
                    </span>
                  )}
                  <span className="chip">{channel.category}</span>
                </div>
                <h1 className="mt-4 font-display text-2xl font-black leading-tight tracking-tighter sm:text-3xl">
                  {channel.stream_title || "Untitled stream"}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <UserLocationTime />
                {isLive && (
                  <div className="flex items-center gap-2 border border-[#27272a] px-3 py-2">
                    <Eye className="h-4 w-4 text-[#e5ff00]" />
                    <span className="font-mono text-sm font-bold" data-testid="viewer-count">
                      {channel.viewer_count || 0}
                    </span>
                  </div>
                )}
                <ShareButton
                  username={channel.username}
                  streamTitle={channel.stream_title}
                />
                <FollowButton
                  username={channel.username}
                  isFollowing={channel.is_following}
                  followerCount={channel.follower_count}
                  ownChannel={ownChannel}
                  onChange={(res) =>
                    setChannel((prev) => ({
                      ...prev,
                      is_following: res.following,
                      follower_count: res.follower_count,
                    }))
                  }
                />
                <SubscribeButton
                  username={channel.username}
                  isSubscribed={channel.is_subscribed}
                  subscriberCount={channel.subscriber_count}
                  ownChannel={ownChannel}
                  onChange={(res) =>
                    setChannel((prev) => ({
                      ...prev,
                      is_subscribed: res.subscribed,
                      subscriber_count: res.subscriber_count,
                    }))
                  }
                />
                <Link
                  to="/payouts?buy=true"
                  data-testid="channel-buy-bits-btn"
                  className="flex items-center gap-1.5 border border-[#e5ff00]/60 bg-[#e5ff00]/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#e5ff00] hover:border-[#e5ff00] hover:bg-[#e5ff00]/25 transition-all"
                  title="Purchase Vinyl Bits to Support DJ"
                >
                  <Coins className="h-4 w-4 text-[#e5ff00] animate-pulse" />
                  <span>BUY BITS</span>
                </Link>
              </div>
            </div>
          </div>

          {/* MOBILE CHAT PLACEMENT: Appears directly under video/meta card on mobile/tablet */}
          <div className="block lg:hidden w-full">
            <ChatPanel username={channel.username} />
          </div>

          {/* Schedule */}
          <div>
            <ScheduleDisplay schedule={channel.schedule} username={channel.username} />
          </div>

          {/* Past sets */}
          <div>
            <SessionList username={channel.username} />
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-4">
          {/* DESKTOP CHAT PLACEMENT: Appears in the sidebar on large screens */}
          <div className="hidden lg:block">
            <ChatPanel username={channel.username} />
          </div>

          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="label-caps">// BROADCASTER</div>
            <div className="mt-4 flex items-center gap-4">
              {channel.photo_url ? (
                <img
                  src={fileUrl(channel.photo_url)}
                  alt=""
                  className="h-16 w-16 border border-[#27272a] object-cover grayscale"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center border border-[#27272a]">
                  <User className="h-6 w-6 text-zinc-500" />
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-display text-xl font-black">{channel.display_name}</div>
                <div className="font-mono text-xs text-zinc-500">@{channel.username}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {channel.follower_count || 0} followers
                </div>
              </div>
            </div>
          </div>

          {/* Channel QR Code Card */}
          <div className="border border-[#27272a] bg-[#0a0a0a] p-6" data-testid="channel-qr-card">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-[#e5ff00]" />
              <div className="label-caps mb-0">// CHANNEL QR CODE</div>
            </div>

            <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-400">
              Scan or share to tune into <code className="text-[#e5ff00]">@{channel.username}</code>.
            </p>

            <div className="mt-4 flex flex-col items-center justify-center border border-dashed border-[#27272a] bg-black p-4">
              <div className="rounded bg-white p-2.5 shadow-lg">
                <QRCodeSVG
                  value={`${window.location.origin}/channel/${channel.username}`}
                  size={130}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <span className="mt-2 font-mono text-[9px] text-zinc-500 uppercase tracking-widest truncate max-w-[200px]">
                {window.location.origin}/channel/{channel.username}
              </span>
            </div>
          </div>

          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="label-caps">// STREAM INFO</div>
            <dl className="mt-4 space-y-3 font-mono text-xs">
              <Row label="STATUS">{isLive ? "LIVE" : "OFF AIR"}</Row>
              <Row label="CATEGORY">{channel.category}</Row>
              <Row label="VIEWERS">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-[#e5ff00]" />
                  <span>{channel.viewer_count || 0}</span>
                </span>
              </Row>
              <Row label="PLAYBACK ID" mono>
                {channel.playback_id}
              </Row>
            </dl>
          </div>
        </aside>
      </div>

      {isReportModalOpen && (
        <div
          data-testid="report-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md border border-[#27272a] bg-[#0a0a0a] p-6 shadow-2xl sm:p-8 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-500">
              <Flag className="h-4 w-4 text-red-500" />
              // REPORT BROADCAST
            </div>
            <h2 className="mt-2 font-display text-2xl font-black uppercase text-white sm:text-3xl">
              COMMUNITY FLAG
            </h2>
            <p className="mt-2 text-xs text-zinc-400">
              Help us keep the airwaves safe. Let us know if <span className="text-[#e5ff00] font-bold">@{channel.username}</span> is in violation of our community standards.
            </p>

            {!user ? (
              <div className="mt-6 space-y-4 text-center">
                <p className="font-mono text-xs text-red-400 uppercase">
                  You must be signed in to submit a community moderation report.
                </p>
                <Link
                  to="/login"
                  className="btn-primary w-full flex items-center justify-center py-2.5 text-xs text-black font-bold font-mono tracking-wider bg-[#e5ff00] hover:bg-white transition-colors"
                >
                  SIGN IN TO CONTINUE
                </Link>
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="w-full border border-zinc-700 bg-black py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                >
                  CLOSE
                </button>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="label-caps mb-1 block text-zinc-300">
                    REASON FOR REPORTING
                  </label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full text-white bg-black border border-[#27272a] p-2 rounded-none font-mono text-xs focus:border-[#e5ff00] focus:outline-none"
                    required
                  >
                    <option value="" disabled>-- Select a reason --</option>
                    <option value="harassment">Harassment / Hate Speech</option>
                    <option value="explicit">Explicit / Adult Content</option>
                    <option value="copyright">Copyright Violation</option>
                    <option value="spam">Spam / Scam / Phishing</option>
                    <option value="guidelines">General Guidelines Violation</option>
                    <option value="other">Other / Custom Details</option>
                  </select>
                </div>

                <div>
                  <label className="label-caps mb-1 block text-zinc-300">
                    ADDITIONAL DETAILS (OPTIONAL)
                  </label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    className="w-full text-white bg-black border border-[#27272a] p-2 rounded-none font-mono text-xs focus:border-[#e5ff00] focus:outline-none h-24 resize-none"
                    placeholder="Provide timestamps or specific details..."
                    maxLength={500}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsReportModalOpen(false);
                      setReportReason("");
                      setReportDetails("");
                    }}
                    className="flex-1 border border-zinc-700 bg-black py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReport}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    {isSubmittingReport ? "SUBMITTING..." : "SUBMIT FLAG"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children, mono }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#27272a] pb-2 last:border-0 last:pb-0">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right ${mono ? "break-all font-mono text-[10px]" : "font-bold uppercase"}`}>
        {children}
      </span>
    </div>
  );
}