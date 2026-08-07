import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, User } from "lucide-react";
import { fileUrl } from "@/lib/api";

const THUMBS = [
  "https://images.unsplash.com/photo-1541126274323-dbac58d14741?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHw0fHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1496337589254-7e19d01cec44?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwzfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
];

function hashPick(str, arr) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

function isDocId(str) {
  if (!str || typeof str !== "string") return false;
  const trimmed = str.trim();
  return (
    trimmed.length >= 20 &&
    /^[A-Za-z0-9_-]+$/.test(trimmed)
  );
}

function getCleanUsername(channel) {
  const username = channel?.username;
  if (username && typeof username === "string" && !isDocId(username) && username !== "undefined" && username !== "null") {
    return username.trim();
  }

  const display = channel?.display_name;
  if (display && typeof display === "string" && !isDocId(display) && display !== "undefined" && display !== "null") {
    return display.trim().toLowerCase().replace(/\s+/g, "_");
  }

  const cid = channel?.channel_id || channel?.id;
  if (cid === "nsU1v44XFnN3FloJvNePqj6cBG2" || channel?.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
    return "djsparkz";
  }

  if (cid && cid !== "undefined" && cid !== "null") {
    return cid;
  }

  return "djsparkz";
}

export default function ChannelCard({ channel }) {
  const [imageError, setImageError] = useState(false);
  const channelSlug = getCleanUsername(channel);
  const thumb = channel?.thumbnail_url
    ? fileUrl(channel.thumbnail_url)
    : hashPick(channelSlug, THUMBS);
  const customThumb = !!channel?.thumbnail_url;

  // Broadcaster avatar check from various potential API fields
  const avatarUrl = channel?.photo_url || 
                    channel?.photoUrl || 
                    channel?.avatar_url || 
                    channel?.avatar || 
                    channel?.profile_image || 
                    channel?.broadcaster_avatar || 
                    channel?.user?.avatar_url || 
                    channel?.user?.photo_url || 
                    channel?.user?.photoUrl || 
                    channel?.user?.avatar ||
                    channel?.user?.profile_image ||
                    channel?.user?.broadcaster_avatar;

  const resolvedAvatar = avatarUrl ? fileUrl(avatarUrl) : null;

  const initials = (() => {
    const name = channel?.display_name || channel?.username || channelSlug || "?";
    const cleanName = typeof name === "string" ? name.trim() : "?";
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    }
    return cleanName.slice(0, 2).toUpperCase();
  })();

  const initialsBgColor = (() => {
    const colors = [
      "bg-zinc-800 text-zinc-200 border-zinc-700",
      "bg-zinc-900 text-zinc-300 border-zinc-850",
      "bg-neutral-800 text-neutral-200 border-neutral-700",
      "bg-[#18181b] text-[#e4e4e7] border-[#27272a]",
    ];
    let h = 0;
    const s = channelSlug || "";
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return colors[Math.abs(h) % colors.length];
  })();

  return (
    <Link
      to={`/channel/${channelSlug}`}
      data-testid={`channel-card-${channelSlug}`}
      className="group block border border-[#27272a] bg-[#0a0a0a] transition-colors hover:border-white"
    >
      <div className="relative aspect-video overflow-hidden border-b border-[#27272a] bg-black">
        <img
          src={thumb}
          alt=""
          className={`h-full w-full object-cover transition-all duration-300 ${customThumb ? "" : "grayscale group-hover:grayscale-0"}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          {Boolean(channel.is_live || channel.isLive) ? (
            <span className="live-badge">
              <span className="dot live-dot" /> LIVE
            </span>
          ) : (
            <span className="chip">OFFLINE</span>
          )}
        </div>
        {Boolean(channel.is_live || channel.isLive) && (
          <div className="absolute right-3 top-3 flex items-center gap-1 bg-black/80 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white">
            <Eye className="h-3 w-3" />
            {channel.viewer_count || 0}
          </div>
        )}
      </div>
      <div className="flex items-start gap-3 p-4">
        {resolvedAvatar && !imageError ? (
          <img
            src={resolvedAvatar}
            alt=""
            className="h-10 w-10 flex-shrink-0 border border-[#27272a] object-cover grayscale group-hover:grayscale-0"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center border font-mono text-xs font-bold select-none uppercase ${initialsBgColor}`}>
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-bold leading-tight">
            {channel.stream_title || "Untitled stream"}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-zinc-400">
            @{channelSlug}
          </div>
          <div className="mt-2">
            <span className="chip">{channel.category}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
