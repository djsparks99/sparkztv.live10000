import express, { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import admin from "firebase-admin";

import { 
  IvsClient, 
  CreateChannelCommand, 
  ListChannelsCommand,
  GetStreamKeyCommand,
  ListStreamKeysCommand,
  GetStreamCommand 
} from "@aws-sdk/client-ivs";

dotenv.config();

// Initialize Firebase Admin for real-time Firestore synchronization
let dbFirestore: any = null;
try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    if (firebaseConfig.projectId) {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
      if (firebaseConfig.firestoreDatabaseId) {
        dbFirestore = admin.firestore(firebaseConfig.firestoreDatabaseId as any);
      } else {
        dbFirestore = admin.firestore();
      }
      console.log("[Firebase Admin] Initialized successfully with projectId:", firebaseConfig.projectId);
    }
  }
} catch (e: any) {
  console.warn("[Firebase Admin] Failed to initialize firebase-admin:", e.message);
}

async function updateFirestoreChannelLiveStatus(isLive: boolean) {
  try {
    const nowIso = new Date().toISOString();
    
    // Update in-memory channel to ensure REST API is instantly in sync
    const masterChan = db.channels.get("djsparkz") || db.channels.get("nsU1v44XFnN3FloJvNePqj6cBG2");
    if (masterChan) {
      masterChan.is_live = isLive;
      masterChan.isLive = isLive;
      masterChan.last_updated = nowIso;
      if (isLive) {
        masterChan.stream_started_at = masterChan.stream_started_at || nowIso;
      } else {
        masterChan.stream_started_at = null;
      }
    }

    if (dbFirestore) {
      const primaryDocId = "nsU1v44XFnN3FloJvNePqj6cBG2";
      
      const updatePayload: Record<string, any> = {
        is_live: isLive,
        isLive: isLive,
        last_updated: nowIso,
      };

      if (isLive) {
        updatePayload.stream_started_at = masterChan?.stream_started_at || nowIso;
      } else {
        updatePayload.stream_started_at = null;
      }

      // Update both document keys to cover all lookup types in Firestore
      await dbFirestore.collection("channels").doc(primaryDocId).set(updatePayload, { merge: true });
      await dbFirestore.collection("channels").doc("djsparkz").set(updatePayload, { merge: true });
      
      console.log(`[Firebase Admin] Successfully set channel live status to ${isLive} in Firestore.`);
    }
  } catch (e: any) {
    console.error("[Firebase Admin] Failed to update Firestore channel status:", e.message);
  }
}

console.log("SPARKZ.TV - Server booting up with universal avatar sync.");

let ivsClient: IvsClient | null = null;
function getIvsClient() {
  if (!ivsClient) {
    const region = process.env.AWS_REGION || "eu-west-1";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    if (accessKeyId && secretAccessKey) {
      ivsClient = new IvsClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
      console.log(`[AWS IVS] Client initialized successfully for region ${region}.`);
    }
  }
  return ivsClient;
}

async function getOrCreatePersistentIvsChannel(username: string): Promise<{
  playbackUrl: string;
  streamKey: string;
  ingestEndpoint: string;
  arn: string;
}> {
  const client = getIvsClient();
  const safeName = `sparkz-${username}`;

  if (client) {
    try {
      const listCmd = new ListChannelsCommand({ filterByName: safeName });
      const listRes = await client.send(listCmd);
      
      if (listRes.channels && listRes.channels.length > 0) {
        const existingSummary = listRes.channels[0];
        const arn = existingSummary.arn;
        
        const keysRes = await client.send(new ListStreamKeysCommand({ channelArn: arn }));
        let streamKeyVal = "";
        
        if (keysRes.streamKeys && keysRes.streamKeys.length > 0) {
          const keyDetail = await client.send(new GetStreamKeyCommand({ arn: keysRes.streamKeys[0].arn }));
          streamKeyVal = keyDetail.streamKey?.value || "";
        }

        if (existingSummary.playbackUrl && streamKeyVal) {
          return {
            playbackUrl: existingSummary.playbackUrl,
            streamKey: streamKeyVal,
            ingestEndpoint: `rtmps://${(existingSummary.ingestEndpoint || "global-contribute.live-video.net").replace(/^rtmps?:\/\//, "").replace(/\/app\/?$/, "")}/app/`,
            arn: arn!,
          };
        }
      }
    } catch (e: any) {}

    try {
      const createCmd = new CreateChannelCommand({
        name: safeName,
        latencyMode: "LOW",
        type: "STANDARD",
      });
      const createRes = await client.send(createCmd);
      
      const channelArn = createRes.channel?.arn || "";
      const playbackUrl = createRes.channel?.playbackUrl || "";
      const streamKeyVal = createRes.streamKey?.value || "";
      const ingestEndpoint = createRes.channel?.ingestEndpoint || "global-contribute.live-video.net";

      if (playbackUrl && streamKeyVal) {
        return {
          playbackUrl,
          streamKey: streamKeyVal,
          ingestEndpoint: `rtmps://${ingestEndpoint.replace(/^rtmps?:\/\//, "").replace(/\/app\/?$/, "")}/app/`,
          arn: channelArn,
        };
      }
    } catch (e: any) {}
  }

  return {
    playbackUrl: "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.536395396152.channel.d-8HJvvryP0PNm.m3u8",
    streamKey: "SK_us-west-2_dummyKey999999",
    ingestEndpoint: "rtmps://global-contribute.live-video.net:443/app/",
    arn: "arn:aws:ivs:eu-west-1:000000000000:channel/fallback",
  };
}

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
});

interface UserDoc {
  uid: string;
  email: string;
  username: string;
  display_name: string;
  photo_url: string | null;
  social_share_image_url?: string | null;
  bio: string;
  password_hash: string;
  created_at: string;
  watts?: number;
  follows?: string[];
}

interface ChannelDoc {
  channel_id: string;
  user_uid: string;
  username: string;
  display_name: string;
  photo_url: string | null;
  thumbnail_url: string | null;
  ivs_channel_arn: string;
  stream_key: string;
  playback_id: string;
  stream_title: string;
  category: string;
  is_live: boolean;
  viewer_count: number;
  record_enabled: boolean;
  last_updated: string;
  rtmp_url?: string;
  schedules?: any[];
}

class InMemStore {
  users: Map<string, UserDoc> = new Map();
  channels: Map<string, ChannelDoc> = new Map();

  constructor() {
    this.seedDefaults();
  }

  seedDefaults() {
    const now = new Date().toISOString();
    const djsparkzUser: UserDoc = {
      uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
      email: "djsparkz@sparkz.tv",
      username: "djsparkz",
      display_name: "djsparkz",
      photo_url: null,
      social_share_image_url: null,
      bio: "Broadcasting live and loud on SPARKZ.TV",
      password_hash: bcrypt.hashSync("password123", 8),
      created_at: now,
      watts: 2500,
      follows: [],
    };
    this.users.set(djsparkzUser.uid, djsparkzUser);
  }
}

const db = new InMemStore();

const activeViewersPerRoom = new Map<string, Set<string>>();

const DUMMY_USERNAMES = [
  "pirate_fm", "acid_vault", "dub_station", "test", "demo", "undefined", "null", "dummy", "user", "channel"
];

function isDummyOrInvalid(channel: any) {
  if (!channel) return true;
  const username = (channel.username || "").toLowerCase().trim();
  const displayName = (channel.display_name || "").toLowerCase().trim();
  const id = (channel.id || channel.channel_id || "").toLowerCase().trim();

  if (!id || id === "undefined" || id === "null") return true;
  if (channel.is_dummy || channel.isDummy) return true;
  if (DUMMY_USERNAMES.includes(username) || DUMMY_USERNAMES.includes(displayName) || DUMMY_USERNAMES.includes(id)) {
    return true;
  }
  if (id.startsWith("chan-pirate") || id.startsWith("chan-acid") || id.startsWith("chan-dub") || id.startsWith("dummy-")) {
    return true;
  }
  if (username.length < 2) return true;
  return false;
}

function channelPublic(c: ChannelDoc, opts: { include_stream_key?: boolean, viewerIp?: string } = {}) {
  if (!c || c.channel_id === "undefined" || c.username === "undefined") return {};
  
  const isMaster = (c.username || "").toLowerCase() === "djsparkz" || c.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2";
  const user = db.users.get(c.user_uid || "nsU1v44XFnN3FloJvNePqj6cBG2");
  const activePhoto = c.photo_url || user?.photo_url || null;
  
  const channelId = isMaster ? "djsparkz" : (c.channel_id || c.username || "");
  const username = isMaster ? "djsparkz" : (c.username || "");
  const displayName = isMaster ? "djsparkz" : (c.display_name || username);
  const userUid = isMaster ? "nsU1v44XFnN3FloJvNePqj6cBG2" : (c.user_uid || "");
  const playbackId = c.playback_id || "";

  const roomViewers = activeViewersPerRoom.get(username);
  const trueViewerCount = roomViewers ? roomViewers.size : (c.viewer_count || 0);

  const out: Record<string, any> = {
    channel_id: channelId,
    id: channelId,
    user_uid: userUid,
    username: username,
    display_name: displayName,
    photo_url: activePhoto,
    photoUrl: activePhoto,
    avatar: activePhoto,
    avatar_url: activePhoto,
    thumbnail_url: c.thumbnail_url || null,
    thumbnailUrl: c.thumbnail_url || null,
    playback_id: playbackId,
    playbackUrl: playbackId,
    stream_title: c.stream_title || `${displayName}'s Live Stream`,
    category: c.category || "music",
    is_live: Boolean(c.is_live),
    isLive: Boolean(c.is_live),
    viewer_count: trueViewerCount,
    last_updated: c.last_updated,
    schedules: c.schedules || [],
    schedule: c.schedules && c.schedules.length > 0 ? c.schedules[0] : null,
  };

  if (opts.include_stream_key) {
    out.stream_key = c.stream_key || "";
    out.streamKey = c.stream_key || "";
    out.rtmp_url = c.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/";
    out.ivs_channel_arn = c.ivs_channel_arn || "";
  }
  return out;
}

async function getMasterChannel() {
  let chan = db.channels.get("djsparkz") || db.channels.get("nsU1v44XFnN3FloJvNePqj6cBG2");
  const user = db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;

  if (!chan) {
    const ivsData = await getOrCreatePersistentIvsChannel("djsparkz");
    chan = {
      channel_id: "djsparkz",
      user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
      username: "djsparkz",
      display_name: user?.display_name || "djsparkz",
      photo_url: user?.photo_url || null,
      thumbnail_url: null,
      ivs_channel_arn: ivsData.arn,
      stream_key: ivsData.streamKey,
      playback_id: ivsData.playbackUrl,
      stream_title: "djsparkz's Live Stream",
      category: "music",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: new Date().toISOString(),
      rtmp_url: ivsData.ingestEndpoint,
      schedules: [],
    };
    db.channels.set("djsparkz", chan);
    db.channels.set("nsU1v44XFnN3FloJvNePqj6cBG2", chan);
  } else if (user?.photo_url) {
    chan.photo_url = user.photo_url;
  }
  return chan;
}

let lastLiveCheckTime = 0;
async function syncMasterChannelLiveStatus(force = false) {
  const now = Date.now();
  if (!force && (now - lastLiveCheckTime < 1500)) {
    return; // Prevent excessive API calls by throttling to at most once per 1.5s
  }
  lastLiveCheckTime = now;
  try {
    const channel = await getMasterChannel();
    const client = getIvsClient();
    
    let isLiveAws = false;
    let isLiveFirestore = false;

    if (client && channel?.ivs_channel_arn && !channel.ivs_channel_arn.includes("fallback")) {
      try {
        const response = await client.send(new GetStreamCommand({ channelArn: channel.ivs_channel_arn }));
        isLiveAws = !!response.stream;
      } catch (err: any) {
        console.error("[IVS Sync] AWS stream check failed:", err.message);
      }
    }

    if (dbFirestore) {
      try {
        const docSnap = await dbFirestore.collection("channels").doc("djsparkz").get();
        if (docSnap.exists) {
          const fsData = docSnap.data();
          if (fsData) {
            isLiveFirestore = Boolean(fsData.is_live || fsData.isLive);
          }
        }
      } catch (fsErr: any) {
        console.warn("[IVS Sync] Failed to read fallback live status from Firestore:", fsErr.message);
      }
    }

    // Force Live Feed Detection: EITHER AWS IVS is live OR Firestore record is live
    const isLive = isLiveAws || isLiveFirestore;

    if (channel.is_live !== isLive) {
      channel.is_live = isLive;
      channel.isLive = isLive;
      await updateFirestoreChannelLiveStatus(isLive);
      console.log(`[IVS Sync] Auto-synced live status to ${isLive} for ${channel.username}`);
    }
  } catch (err: any) {
    console.error("[IVS Sync] Error syncing live status:", err.message);
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["*"] }));
app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Automatically strip tracking query parameters (like fbclid) from incoming requests, except for static assets
app.use((req: Request, res: Response, next: NextFunction) => {
  const isStaticAsset = /\.(png|jpg|jpeg|gif|webp|ico|svg|css|js|xml|txt)$/i.test(req.path);
  if (!isStaticAsset && (req.query.fbclid || req.query.utm_source || req.query.utm_medium)) {
    return res.redirect(301, req.path);
  }
  next();
});

async function startServer() {
  db.channels.clear();
  getMasterChannel().catch((err) => {
    console.warn("Failed to pre-warm master channel in background:", err.message);
  });

  app.get("/api/channels/mine", async (req, res) => {
    try {
      await syncMasterChannelLiveStatus();
      const channel = await getMasterChannel();
      const publicData = channelPublic(channel, { include_stream_key: true });
      return res.json({
        ...publicData,
        username: "djsparkz",
        display_name: "djsparkz",
        stream_key: channel.stream_key,
        streamKey: channel.stream_key,
        playback_id: channel.playback_id,
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch channel", details: err.message });
    }
  });

  app.get("/api/channels", async (req, res) => {
    try {
      await syncMasterChannelLiveStatus();
      const masterChannel = await getMasterChannel();
      const channelsList: any[] = [channelPublic(masterChannel)];

      const seenUsernames = new Set<string>();
      const seenUids = new Set<string>();

      seenUsernames.add("djsparkz");
      if (masterChannel.user_uid) {
        seenUids.add(masterChannel.user_uid);
      }

      for (const cDoc of db.channels.values()) {
        const username = (cDoc.username || "").toLowerCase().trim();
        const userUid = (cDoc.user_uid || cDoc.channel_id || "").trim();

        if (!username || username === "undefined" || username === "null") continue;
        if (username === "djsparkz" || userUid === "nsU1v44XFnN3FloJvNePqj6cBG2") continue;

        if (isDummyOrInvalid(cDoc)) continue;
        if (seenUsernames.has(username) || seenUids.has(userUid)) continue;

        seenUsernames.add(username);
        if (userUid) {
          seenUids.add(userUid);
        }

        channelsList.push(channelPublic(cDoc));
      }

      return res.json(channelsList);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to list channels" });
    }
  });

  app.get("/api/channels/:id", async (req, res) => {
    try {
      await syncMasterChannelLiveStatus();
      const requestedId = req.params.id;
      const normalizedId = (requestedId || "").toLowerCase().trim();

      if (normalizedId === "djsparkz" || normalizedId === "nsu1v44xfnn3flojvnepqj6cbg2") {
        const channel = await getMasterChannel();
        return res.json(channelPublic(channel, { include_stream_key: true }));
      }

      const channelInMem = db.channels.get(requestedId) || Array.from(db.channels.values()).find(
        (c) => (c.username || "").toLowerCase() === normalizedId
      );

      if (channelInMem && !isDummyOrInvalid(channelInMem)) {
        return res.json(channelPublic(channelInMem, { include_stream_key: true }));
      }

      const channel = await getMasterChannel();
      return res.json(channelPublic(channel, { include_stream_key: true }));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch channel" });
    }
  });

  app.post("/api/stream/create", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      return res.json({
        stream_key: channel.stream_key,
        streamKey: channel.stream_key,
        playback_id: channel.playback_id,
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to create/get stream", details: err.message });
    }
  });

  app.post("/api/ivs/check-status", async (req, res) => {
    try {
      await syncMasterChannelLiveStatus(true);
      const channel = await getMasterChannel();
      return res.json({ isActive: channel.is_live, isLive: channel.is_live, is_live: channel.is_live });
    } catch (e) {
      const channel = await getMasterChannel();
      return res.json({ isActive: channel.is_live, isLive: channel.is_live, is_live: channel.is_live });
    }
  });

  app.post("/api/webhook/stream-end", async (req, res) => {
    try {
      console.log("[Webhook] Received explicit stream-end signal:", req.body);
      const channel = await getMasterChannel();
      channel.is_live = false;
      await updateFirestoreChannelLiveStatus(false);
      return res.json({ success: true, message: "Stream status set to offline instantly." });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to clear stream status", details: err.message });
    }
  });

  app.post("/api/ivs/webhook", async (req, res) => {
    try {
      const payload = req.body || {};
      const eventName = payload.detail?.event_name || payload.eventName || payload.event || "";
      console.log("[IVS Webhook] Received webhook event:", eventName, payload);
      
      const channel = await getMasterChannel();
      
      if (eventName === "Stream End" || eventName === "Session Ended" || eventName.toLowerCase().includes("end") || eventName === "stream.idle") {
        channel.is_live = false;
        await updateFirestoreChannelLiveStatus(false);
      } else if (eventName === "Stream Start" || eventName === "Session Started" || eventName.toLowerCase().includes("start") || eventName === "stream.started") {
        channel.is_live = true;
        await updateFirestoreChannelLiveStatus(true);
      }
      
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Webhook processing failed", details: err.message });
    }
  });

  app.post("/api/livepeer/webhook", async (req, res) => {
    try {
      const payload = req.body || {};
      const eventName = payload.event || "";
      console.log("[Livepeer Webhook] Received event:", eventName, payload);
      
      const channel = await getMasterChannel();
      
      if (eventName === "stream.idle" || eventName.toLowerCase().includes("end")) {
        channel.is_live = false;
        await updateFirestoreChannelLiveStatus(false);
      } else if (eventName === "stream.started" || eventName.toLowerCase().includes("start")) {
        channel.is_live = true;
        await updateFirestoreChannelLiveStatus(true);
      }
      
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Webhook processing failed", details: err.message });
    }
  });

  const api = express.Router();

  const authMiddleware = async (req: any, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const fallbackUid = "nsU1v44XFnN3FloJvNePqj6cBG2";

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      let user = db.users.get(fallbackUid);
      if (!user) {
        user = {
          uid: fallbackUid,
          email: "djsparkz@sparkz.tv",
          username: "djsparkz",
          display_name: "djsparkz",
          photo_url: null,
          bio: "Broadcasting live and loud on SPARKZ.TV",
          password_hash: "",
          created_at: new Date().toISOString(),
          watts: 2500,
          follows: [],
        };
        db.users.set(fallbackUid, user);
      }
      req.user = user;
      return next();
    }

    const token = authHeader.split(" ")[1];
    try {
      const decodedToken = jwt.decode(token) as any;
      if (!decodedToken) {
        throw new Error("Invalid JWT token format");
      }
      const uid = decodedToken.uid || decodedToken.sub;
      if (!uid) {
        throw new Error("No UID found in JWT");
      }

      let user = db.users.get(uid);
      if (!user) {
        const email = decodedToken.email || "";
        const isDjSparkz = email === "markysparks99@gmail.com";
        user = {
          uid,
          email,
          username: isDjSparkz ? "djsparkz" : (email.split("@")[0] || "user"),
          display_name: isDjSparkz ? "djsparkz" : (decodedToken.name || email.split("@")[0] || "User"),
          photo_url: decodedToken.picture || null,
          bio: isDjSparkz ? "Broadcasting live and loud on SPARKZ.TV" : "",
          password_hash: "",
          created_at: new Date().toISOString(),
          watts: isDjSparkz ? 2500 : 100,
          follows: [],
        };
        db.users.set(uid, user);
      }

      if (user && user.email === "markysparks99@gmail.com") {
        user.username = "djsparkz";
        user.display_name = "djsparkz";
      }

      req.user = user;
      next();
    } catch (err) {
      console.warn("[Auth Middleware Token Verification Failed]:", err);
      req.user = db.users.get(fallbackUid);
      next();
    }
  };
  
  api.get("/categories", (req, res) => {
    return res.json([
      "music", "talk", "gaming", "art", "outdoors", "lounge", "dj_mix", "podcast", "radio", "vibes"
    ]);
  });

  const handleUserUpdate = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (req.body?.display_name !== undefined) {
        user.display_name = req.body.display_name;
        db.users.set(user.uid, user);

        if (user.uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
          const channel = await getMasterChannel();
          channel.display_name = req.body.display_name;
        }
      }
      if (req.body?.bio !== undefined) {
        user.bio = req.body.bio;
        db.users.set(user.uid, user);
      }
      if (req.body?.social_share_image_url !== undefined) {
        user.social_share_image_url = req.body.social_share_image_url;
        db.users.set(user.uid, user);
      }

      return res.json({
        ...user,
        username: user.username,
        display_name: user.display_name,
        photo_url: user.photo_url,
        photoUrl: user.photo_url,
        avatar: user.photo_url,
        avatar_url: user.photo_url,
        social_share_image_url: user.social_share_image_url || null,
        socialShareImageUrl: user.social_share_image_url || null,
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update user profile", details: err.message });
    }
  };

  api.patch("/users/me", authMiddleware, handleUserUpdate);
  api.put("/users/me", authMiddleware, handleUserUpdate);
  api.post("/users/me", authMiddleware, handleUserUpdate);

  api.get("/users/profile/:username", async (req, res) => {
    try {
      const usernameParam = req.params.username.toLowerCase();
      let targetUser: UserDoc | undefined = undefined;
      for (const u of db.users.values()) {
        if (u.username.toLowerCase() === usernameParam) {
          targetUser = u;
          break;
        }
      }

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        username: targetUser.username,
        display_name: targetUser.display_name,
        photo_url: targetUser.photo_url,
        bio: targetUser.bio,
        created_at: targetUser.created_at,
        watts: targetUser.watts || 100,
        followers_count: targetUser.follows ? targetUser.follows.length : 0,
      });
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to fetch user profile", details: e.message });
    }
  });

  const handleChannelUpdate = async (req: Request, res: Response) => {
    try {
      const channel = await getMasterChannel();

      if (req.body?.stream_title !== undefined) {
        channel.stream_title = req.body.stream_title;
      }
      if (req.body?.category !== undefined) {
        if (typeof req.body.category !== "string") {
          return res.status(400).json({ error: "Category must be a string" });
        }
        channel.category = req.body.category;
      }
      if (req.body?.thumbnail_url !== undefined) {
        channel.thumbnail_url = req.body.thumbnail_url;
      }
      
      return res.json(channelPublic(channel, { include_stream_key: true }));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update channel", details: err.message });
    }
  };

  api.patch("/channels/mine", handleChannelUpdate);
  api.put("/channels/mine", handleChannelUpdate);
  api.post("/channels/mine", handleChannelUpdate);

  api.get("/channels/mine/schedules", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      return res.json(channel.schedules || []);
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to fetch schedules" });
    }
  });

  api.post("/channels/mine/schedules", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      if (!channel.schedules) channel.schedules = [];

      const newSchedule = {
        id: "sched-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
        title: req.body.title || "Scheduled Broadcast",
        description: req.body.description || "",
        startTime: req.body.startTime || new Date().toISOString(),
        imageUrl: req.body.imageUrl || req.body.image || null,
      };

      channel.schedules.push(newSchedule);
      return res.json({ success: true, schedules: channel.schedules });
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to create schedule" });
    }
  });

  api.put("/channels/mine/schedules/:id", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      if (!channel.schedules) channel.schedules = [];

      const schedId = req.params.id;
      const index = channel.schedules.findIndex((s: any) => s.id === schedId);

      if (index === -1) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      channel.schedules[index] = {
        ...channel.schedules[index],
        title: req.body.title ?? channel.schedules[index].title,
        description: req.body.description ?? channel.schedules[index].description,
        startTime: req.body.startTime ?? channel.schedules[index].startTime,
        imageUrl: req.body.imageUrl ?? req.body.image ?? channel.schedules[index].imageUrl,
      };

      return res.json({ success: true, schedules: channel.schedules });
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  api.delete("/channels/mine/schedules/:id", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      if (!channel.schedules) channel.schedules = [];

      const schedId = req.params.id;
      channel.schedules = channel.schedules.filter((s: any) => s.id !== schedId);

      return res.json({ success: true, schedules: channel.schedules });
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to delete schedule" });
    }
  });

  api.get("/users/me", authMiddleware, async (req: any, res) => {
    const user = req.user;
    return res.json({
      ...user,
      username: user.username,
      display_name: user.display_name,
      photo_url: user.photo_url,
      photoUrl: user.photo_url,
      avatar: user.photo_url,
      avatar_url: user.photo_url,
      social_share_image_url: user.social_share_image_url || null,
      socialShareImageUrl: user.social_share_image_url || null,
    });
  });

  const handlePhotoUpload = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      let photoUrl = user.photo_url;

      if (req.file) {
        photoUrl = `/api/files/${req.file.filename}`;
      } else if (req.body?.photo_url || req.body?.photoUrl || req.body?.photo || req.body?.avatar || req.body?.image) {
        photoUrl = req.body.photo_url || req.body.photoUrl || req.body.photo || req.body.avatar || req.body.image;
      }

      user.photo_url = photoUrl;
      db.users.set(user.uid, user);

      if (user.uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
        const channel = await getMasterChannel();
        channel.photo_url = photoUrl;
      }

      return res.json({
        success: true,
        photo_url: photoUrl,
        photoUrl: photoUrl,
        avatar: photoUrl,
        avatar_url: photoUrl,
        user: {
          ...user,
          username: user.username,
          display_name: user.display_name,
          photo_url: photoUrl,
          photoUrl: photoUrl,
          avatar: photoUrl,
          avatar_url: photoUrl,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update profile photo", details: err.message });
    }
  };

  api.post("/users/me/photo", authMiddleware, upload.single("photo"), handlePhotoUpload);
  api.put("/users/me/photo", authMiddleware, upload.single("photo"), handlePhotoUpload);

  const handleSocialShareUpload = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      let socialShareUrl = user.social_share_image_url || null;

      if (req.file) {
        socialShareUrl = `/api/files/${req.file.filename}`;
      } else if (req.body?.social_share_image_url || req.body?.socialShareImageUrl || req.body?.image) {
        socialShareUrl = req.body.social_share_image_url || req.body.socialShareImageUrl || req.body.image;
      }

      user.social_share_image_url = socialShareUrl;
      db.users.set(user.uid, user);

      return res.json({
        success: true,
        social_share_image_url: socialShareUrl,
        socialShareImageUrl: socialShareUrl,
        user: {
          ...user,
          username: user.username,
          display_name: user.display_name,
          photo_url: user.photo_url,
          social_share_image_url: socialShareUrl,
          socialShareImageUrl: socialShareUrl,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update social share photo", details: err.message });
    }
  };

  api.post("/users/me/social-share", authMiddleware, upload.single("photo"), handleSocialShareUpload);
  api.put("/users/me/social-share", authMiddleware, upload.single("photo"), handleSocialShareUpload);

  api.post("/channels/mine/thumbnail", upload.single("thumbnail"), async (req, res) => {
    try {
      const channel = await getMasterChannel();
      let thumbnailUrl = channel.thumbnail_url || null;

      if (req.file) {
        thumbnailUrl = `/api/files/${req.file.filename}`;
      } else if (req.body?.thumbnail || req.body?.image || req.body?.file) {
        thumbnailUrl = req.body.thumbnail || req.body.image || req.body.file;
      }

      channel.thumbnail_url = thumbnailUrl;

      return res.json({
        success: true,
        thumbnail_url: thumbnailUrl,
        thumbnailUrl: thumbnailUrl,
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update channel thumbnail", details: err.message });
    }
  });

  api.delete("/channels/mine/thumbnail", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      channel.thumbnail_url = null;

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to clear channel thumbnail" });
    }
  });

  api.get("/files/:filename", (req, res, next) => {
    const { filename } = req.params;
    
    // 1. Try matching with extension (e.g. filename is "some-id.jpg")
    const extMatch = filename.match(/\.(png|jpg|jpeg|gif|webp)$/i);
    if (extMatch) {
      const ext = extMatch[1].toLowerCase();
      const baseFilename = filename.substring(0, filename.length - extMatch[0].length);
      
      // Check if file exists under the extensionless base name or the full filename
      let filePath = path.join(uploadsDir, baseFilename);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(uploadsDir, filename);
      }
      
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        let contentType = "image/jpeg";
        if (ext === "png") contentType = "image/png";
        if (ext === "webp") contentType = "image/webp";
        if (ext === "gif") contentType = "image/gif";
        res.setHeader("Content-Type", contentType);
        return res.sendFile(filePath);
      }
    }

    // 2. Try matching without extension (e.g. filename is "some-id" with no trailing .jpg)
    const directPath = path.join(uploadsDir, filename);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
      // Default to image/jpeg since all user uploads in our app are images
      res.setHeader("Content-Type", "image/jpeg");
      return res.sendFile(directPath);
    }

    next();
  });

  api.use("/files", express.static(uploadsDir));
  app.use("/api", api);

  // Dedicated explicit routes for social share images, serving raw binary buffers with forced correct Content-Type headers
  app.get("/og-image.jpg", (req, res) => {
    const paths = [
      path.join(process.cwd(), "public", "og-image.jpg"),
      path.join(process.cwd(), "dist", "og-image.jpg"),
      path.join(__dirname, "public", "og-image.jpg"),
      path.join(__dirname, "og-image.jpg"),
      path.join(__dirname, "..", "public", "og-image.jpg"),
      path.join(__dirname, "..", "dist", "og-image.jpg")
    ];
    let filePath = "";
    for (const p of paths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        filePath = p;
        break;
      }
    }

    try {
      if (filePath) {
        const buffer = fs.readFileSync(filePath);
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.status(200);
        return res.end(buffer);
      }
    } catch (err: any) {
      console.error("[OG-Image] Error serving og-image.jpg:", err.message);
    }
    return res.status(404).send("Not Found");
  });

  app.get("/og-image.png", (req, res) => {
    const paths = [
      path.join(process.cwd(), "public", "og-image.png"),
      path.join(process.cwd(), "dist", "og-image.png"),
      path.join(__dirname, "public", "og-image.png"),
      path.join(__dirname, "og-image.png"),
      path.join(__dirname, "..", "public", "og-image.png"),
      path.join(__dirname, "..", "dist", "og-image.png")
    ];
    let filePath = "";
    for (const p of paths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        filePath = p;
        break;
      }
    }

    try {
      if (filePath) {
        const buffer = fs.readFileSync(filePath);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.status(200);
        return res.end(buffer);
      }
    } catch (err: any) {
      console.error("[OG-Image] Error serving og-image.png:", err.message);
    }
    return res.status(404).send("Not Found");
  });

  // Dynamic feed.xml generator from recent stream metadata records in Firestore (with in-memory fallback)
  app.get("/feed.xml", async (req, res) => {
    const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const host = req.get("host") || "sparkztv.live";
    const baseUrl = `${protocol}://${host}`;

    let channels: any[] = [];
    if (dbFirestore) {
      try {
        const snapshot = await dbFirestore.collection("channels").get();
        snapshot.forEach((doc: any) => {
          const data = doc.data();
          if (data && data.username) {
            channels.push({ id: doc.id, ...data });
          }
        });
        console.log(`[feed.xml] Dynamically fetched ${channels.length} channels from Firestore.`);
      } catch (err: any) {
        console.error("[feed.xml] Error fetching channels from Firestore, falling back to local store:", err.message);
      }
    }

    // Fallback to in-memory channels if Firestore is unavailable, empty, or fails
    if (channels.length === 0) {
      for (const cDoc of db.channels.values()) {
        const username = (cDoc.username || "").toLowerCase().trim();
        if (username && username !== "undefined" && username !== "null" && !isDummyOrInvalid(cDoc)) {
          channels.push(channelPublic(cDoc));
        }
      }
      console.log(`[feed.xml] Fallback: loaded ${channels.length} channels from in-memory store.`);
    }

    // Sort by last_updated or updated_at (newest first)
    channels.sort((a, b) => {
      const dateA = new Date(a.last_updated || a.updated_at || 0).getTime();
      const dateB = new Date(b.last_updated || b.updated_at || 0).getTime();
      return dateB - dateA;
    });

    // XML escape helper
    const escapeXml = (unsafe: string): string => {
      if (!unsafe) return "";
      return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case "<": return "&lt;";
          case ">": return "&gt;";
          case "&": return "&amp;";
          case "'": return "&apos;";
          case "\"": return "&quot;";
          default: return c;
        }
      });
    };

    // Build XML RSS items
    let itemsXml = "";
    if (channels.length > 0) {
      for (const chan of channels) {
        const username = chan.username || chan.id;
        if (!username) continue;

        const displayName = chan.display_name || username;
        const streamTitle = chan.stream_title || `${displayName}'s Live Stream`;
        const category = chan.category || "music";
        const isLive = chan.is_live || chan.isLive || false;
        
        const title = `${escapeXml(displayName)} - ${escapeXml(streamTitle)}`;
        const link = `${baseUrl}/channel/${encodeURIComponent(username)}`;
        const status = isLive ? "[LIVE]" : "[OFFLINE]";
        const description = `${status} ${escapeXml(streamTitle)} - Genre/Category: ${escapeXml(category)}. Tune in to the signal on Sparkz.TV.`;
        
        const rawDate = chan.last_updated || chan.updated_at;
        const pubDate = rawDate ? new Date(rawDate).toUTCString() : new Date().toUTCString();

        itemsXml += `
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${link}</guid>
    </item>`;
      }
    } else {
      // Minimal placeholder item if completely empty
      itemsXml = `
    <item>
      <title>Sparkz.TV Underground Network Live Streams</title>
      <link>${baseUrl}/directory</link>
      <description>Tune in to live broadcasts from independent DJs and underground pirate stations across the globe.</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid>${baseUrl}/directory</guid>
    </item>`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sparkz.TV — Underground Live Broadcasts</title>
    <link>${baseUrl}/</link>
    <description>Live underground DJ sets, radio broadcasts, jungle, techno, and dub streams on Sparkz.TV.</description>
    <language>en-us</language>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />${itemsXml}
  </channel>
</rss>
`;

    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=60"); // Cache for 1 minute
    return res.status(200).send(xml);
  });

  const distPath = path.join(process.cwd(), "dist");
  const publicPath = path.join(process.cwd(), "public");

  // Helper middleware to serve static files with explicit and correct MIME Content-Type headers
  const serveStaticFileWithMime = (dir: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(req.path);
      } catch (err) {
        decodedPath = req.path;
      }

      const filePath = path.join(dir, decodedPath);
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".xml": "application/xml",
            ".txt": "text/plain",
          };
          const contentType = mimeTypes[ext] || "application/octet-stream";
          res.setHeader("Content-Type", contentType);
          return res.sendFile(filePath);
        }
      } catch (err) {
        // Fall through
      }
      next();
    };
  };

  // Serve static assets with explicit MIME headers and 200 OK before SPA routes/catchalls
  app.use(serveStaticFileWithMime(distPath));
  app.use(serveStaticFileWithMime(publicPath));

  app.use(express.static(distPath, { index: false }));
  app.use(express.static(publicPath, { index: false }));

  // Static directory links
  app.use(express.static('public')); 
  app.use('/images', express.static(path.join(publicPath, 'images')));

  // CATCH-ALL ROUTE FOR SPA & DYNAMIC OPEN GRAPH META INJECTION
  app.get("*", async (req, res, next) => {
    if (req.path.includes(".") && !req.path.endsWith(".html")) {
      return next();
    }

    try {
      const indexPath = path.join(distPath, "index.html");
      if (!fs.existsSync(indexPath)) {
        return res.status(404).send("Application is building, please refresh in a moment.");
      }

      let html = fs.readFileSync(indexPath, "utf8");

      const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
      const host = req.get("host") || "sparkztv.live";

      let title = "SPARKZ.TV // Your Stream, Your Mix, Your Rules";
      let description = "Decentralized broadcast protocol. No censorship. Full control. Watch live streams from the world's best underground DJs.";
      let image = `${protocol}://${host}/og-image.jpg`;
      const url = `${protocol}://${host}${req.originalUrl}`;

      if (req.path.startsWith("/channel/")) {
        const parts = req.path.split("/");
        const usernameIndex = parts.indexOf("channel") + 1;
        const rawUsername = parts[usernameIndex];
        const normalizedId = (rawUsername || "").toLowerCase().trim();

        if (normalizedId) {
          let matchedChannel: any = null;
          if (normalizedId === "djsparkz") {
            matchedChannel = await getMasterChannel();
          } else {
            matchedChannel = db.channels.get(rawUsername) || Array.from(db.channels.values()).find(
              (c: any) => (c.username || "").toLowerCase() === normalizedId
            );
          }

          if (matchedChannel) {
            title = `${matchedChannel.display_name || matchedChannel.username} // ${matchedChannel.stream_title || "Live Stream"}`;
            description = `Watch ${matchedChannel.display_name || matchedChannel.username} live streaming ${matchedChannel.category || 'music'} on SPARKZ.TV. "${matchedChannel.stream_title || 'Join the Signal.'}"`;
            
            let socialShareUrl = null;
            let rawPhoto = null;

            // Try to find matching user profile in-memory
            let assocUser = null;
            if (matchedChannel.user_uid) {
              assocUser = db.users.get(matchedChannel.user_uid);
            }
            if (!assocUser && matchedChannel.username) {
              for (const u of db.users.values()) {
                if (u.username && u.username.toLowerCase() === matchedChannel.username.toLowerCase()) {
                  assocUser = u;
                  break;
                }
              }
            }

            // If firestore is available, fetch the user record dynamically to be real-time
            if (dbFirestore && matchedChannel.user_uid) {
              try {
                const userDocSnap = await dbFirestore.collection("users").doc(matchedChannel.user_uid).get();
                if (userDocSnap.exists) {
                  const uData = userDocSnap.data();
                  if (uData) {
                    if (uData.social_share_image_url) {
                      socialShareUrl = uData.social_share_image_url;
                    }
                    if (uData.photo_url) {
                      rawPhoto = uData.photo_url;
                    }
                  }
                }
              } catch (e: any) {
                console.warn("[Meta Inject] Firestore fetch error:", e.message);
              }
            }

            if (!socialShareUrl && assocUser) {
              socialShareUrl = assocUser.social_share_image_url || null;
            }
            if (!rawPhoto) {
              rawPhoto = matchedChannel.photo_url || matchedChannel.thumbnail_url || (assocUser ? assocUser.photo_url : null);
            }

            // Prioritize custom social share image URL, falling back to standard profile photo or banner
            let targetImage = socialShareUrl || rawPhoto;

            if (targetImage) {
              if (targetImage.includes("api.dicebear.com") && targetImage.includes("/svg")) {
                targetImage = targetImage.replace("/svg", "/png");
              }
              if (targetImage.startsWith("http")) {
                image = targetImage;
              } else {
                let cleanPhoto = targetImage;
                if (cleanPhoto.startsWith("/api/files/") && !cleanPhoto.endsWith(".png") && !cleanPhoto.endsWith(".jpg") && !cleanPhoto.endsWith(".jpeg") && !cleanPhoto.endsWith(".webp") && !cleanPhoto.endsWith(".gif")) {
                  cleanPhoto = `${cleanPhoto}.jpg`;
                }
                image = `${protocol}://${host}${cleanPhoto.startsWith("/") ? "" : "/"}${cleanPhoto}`;
              }
            } else {
              image = `${protocol}://${host}/og-image.jpg`;
            }
          }
        }
      }

      const escapeHtml = (unsafe: string) => {
        return unsafe
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      // Strip any query parameters or hashes from the absolute image URL to prevent Facebook crawler errors
      const cleanImage = image ? image.split("?")[0].split("#")[0] : "";

      const escapedTitle = escapeHtml(title);
      const escapedDescription = escapeHtml(description);
      const escapedImage = escapeHtml(cleanImage);
      const escapedUrl = escapeHtml(url);

      html = html.replace(/<title>.*?<\/title>/gi, `<title>${escapedTitle}</title>`);
      html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/gi, `<meta property="og:title" content="${escapedTitle}" />`);
      html = html.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/gi, `<meta name="twitter:title" content="${escapedTitle}" />`);

      html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/gi, `<meta name="description" content="${escapedDescription}" />`);
      html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/gi, `<meta property="og:description" content="${escapedDescription}" />`);
      html = html.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/gi, `<meta name="twitter:description" content="${escapedDescription}" />`);

      html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/gi, `<meta property="og:image" content="${escapedImage}" />`);
      html = html.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/gi, `<meta name="twitter:image" content="${escapedImage}" />`);

      html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/gi, `<meta property="og:url" content="${escapedUrl}" />`);
      html = html.replace(/<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/gi, `<meta name="twitter:url" content="${escapedUrl}" />`);

      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    } catch (err: any) {
      console.error("[SEO Middleware Error]:", err);
      return res.sendFile(path.join(distPath, "index.html"));
    }
  });

  const CHAT_COLORS = [
    "#ff4a5a", "#e5ff00", "#34d399", "#22d3ee", "#a78bfa",
    "#fb7185", "#38bdf8", "#fb923c", "#f472b6", "#a3e635"
  ];

  const chatRooms = new Map<string, Set<any>>();
  const chatHistory = new Map<string, any[]>();

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const urlObj = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      const pathname = urlObj.pathname;

      if (pathname.startsWith("/api/ws/chat/")) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (e) {
      socket.destroy();
    }
  });

  wss.on("connection", async (ws: any, request: any) => {
    try {
      const urlObj = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      const pathname = urlObj.pathname;
      const chatMatch = pathname.match(/^\/api\/ws\/chat\/([^/]+)$/);
      
      if (!chatMatch) {
        ws.close();
        return;
      }

      const roomName = decodeURIComponent(chatMatch[1]);
      
      const forwardedFor = request.headers["x-forwarded-for"];
      const clientIp = (typeof forwardedFor === "string" ? forwardedFor.split(",")[0] : null) || request.socket.remoteAddress || "unknown-ip";

      const token = urlObj.searchParams.get("token") || "";
      const guestNameParam = urlObj.searchParams.get("guest_name") || "";

      let uid = "guest-" + Math.random().toString(36).substring(2, 9);
      let username = guestNameParam ? guestNameParam.trim() : "Guest";
      let displayName = username;
      let photoUrl: string | null = null;
      let badges = ["guest"];
      let color = CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)];
      let wattsVal = 0;

      if (token && token !== "guest") {
        try {
          const decodedToken = jwt.decode(token) as any;
          if (!decodedToken) {
            throw new Error("Invalid JWT token format");
          }
          uid = decodedToken.uid || decodedToken.sub;
          if (!uid) {
            throw new Error("No UID found in JWT");
          }
          
          let localUser = db.users.get(uid);
          if (!localUser) {
            const nameFromToken = decodedToken.name || decodedToken.email || "User";
            const emailFromToken = decodedToken.email || "";
            const isDjSparkz = emailFromToken === "markysparks99@gmail.com";
            localUser = {
              uid,
              email: emailFromToken,
              username: isDjSparkz ? "djsparkz" : (emailFromToken.split("@")[0] || nameFromToken),
              display_name: isDjSparkz ? "djsparkz" : nameFromToken,
              photo_url: decodedToken.picture || null,
              bio: isDjSparkz ? "Broadcasting live and loud on SPARKZ.TV" : "",
              password_hash: "",
              created_at: new Date().toISOString(),
              watts: isDjSparkz ? 2500 : 100,
              follows: [],
            };
            db.users.set(uid, localUser);
          }

          if (localUser && (localUser.email === "markysparks99@gmail.com" || uid === "nsU1v44XFnN3FloJvNePqj6cBG2")) {
            localUser.username = "djsparkz";
            localUser.display_name = "djsparkz";
          }

          username = localUser.username;
          displayName = localUser.display_name;
          photoUrl = localUser.photo_url;
          wattsVal = typeof localUser.watts === "number" ? localUser.watts : 100;

          badges = [];
          if (username === roomName) {
            badges.push("broadcaster");
          }
          if (wattsVal >= 1000) {
            badges.push("watts_king");
          }
          if (badges.length === 0) {
            badges.push("supporter");
          }
        } catch (err) {
          console.error("[WS Auth Error]:", err);
        }
      }

      const client = {
        ws,
        uid,
        username,
        displayName,
        photoUrl,
        badges,
        color,
        roomName,
        clientIp
      };

      if (!chatRooms.has(roomName)) {
        chatRooms.set(roomName, new Set());
      }
      chatRooms.get(roomName)!.add(client);

      if (!activeViewersPerRoom.has(roomName)) {
        activeViewersPerRoom.set(roomName, new Set());
      }
      activeViewersPerRoom.get(roomName)!.add(clientIp);

      console.log(`[WS] User ${username} (IP: ${clientIp}) connected to room: ${roomName}. Active viewers: ${activeViewersPerRoom.get(roomName)!.size}`);

      const history = chatHistory.get(roomName) || [];
      for (const msg of history) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(msg));
        }
      }

      ws.on("message", async (rawMsg: any) => {
        try {
          const data = JSON.parse(rawMsg.toString());
          
          if (data.type === "typing") {
            const typingPayload = {
              type: "typing",
              uid: client.uid,
              username: client.username,
              display_name: client.displayName,
              is_typing: data.is_typing
            };
            const roomClients = chatRooms.get(roomName);
            if (roomClients) {
              for (const c of roomClients) {
                if (c.ws !== ws && c.ws.readyState === 1) {
                  c.ws.send(JSON.stringify(typingPayload));
                }
              }
            }
          } else if (data.type === "reaction") {
            const reactionPayload = {
              type: "reaction",
              reaction: data.reaction,
              sender_uid: client.uid,
              sender_username: client.username,
              timestamp: new Date().toISOString()
            };
            const roomClients = chatRooms.get(roomName);
            if (roomClients) {
              for (const c of roomClients) {
                if (c.ws.readyState === 1) {
                  c.ws.send(JSON.stringify(reactionPayload));
                }
              }
            }
          } else {
            const text = data.text || "";
            if (!text.trim()) return;

            const isHighlighted = !!data.is_highlighted;
            const highlightType = data.highlight_type || "neon_glow";

            if (isHighlighted) {
              wattsVal = Math.max(0, wattsVal - 50);
              const localUser = db.users.get(client.uid);
              if (localUser) {
                localUser.watts = wattsVal;
              }
            }

            const messagePayload = {
              type: "message",
              id: "msg-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9),
              text: text,
              sender_uid: client.uid,
              sender_username: client.username,
              sender_display_name: client.displayName,
              sender_photo_url: client.photoUrl,
              created_at: new Date().toISOString(),
              is_highlighted: isHighlighted,
              highlight_type: highlightType,
              sender_badges: client.badges,
              sender_color: client.color,
              user_watts: wattsVal
            };

            if (!chatHistory.has(roomName)) {
              chatHistory.set(roomName, []);
            }
            const roomHistory = chatHistory.get(roomName)!;
            roomHistory.push(messagePayload);
            if (roomHistory.length > 50) {
              roomHistory.shift();
            }

            const roomClients = chatRooms.get(roomName);
            if (roomClients) {
              for (const c of roomClients) {
                if (c.ws.readyState === 1) {
                  c.ws.send(JSON.stringify(messagePayload));
                }
              }
            }
          }
        } catch (e) {
          console.error("[WS Message Error]:", e);
        }
      });

      ws.on("close", () => {
        console.log(`[WS] User ${username} disconnected from room: ${roomName}`);
        const roomClients = chatRooms.get(roomName);
        if (roomClients) {
          roomClients.delete(client);
          
          const remainingIps = new Set<string>();
          for (const c of roomClients) {
            remainingIps.add(c.clientIp);
          }
          if (remainingIps.size > 0) {
            activeViewersPerRoom.set(roomName, remainingIps);
          } else {
            activeViewersPerRoom.delete(roomName);
          }

          if (roomClients.size === 0) {
            chatRooms.delete(roomName);
          }
        }
      });

      ws.on("error", (err: any) => {
        console.error(`[WS] Connection error for ${username}:`, err);
      });

    } catch (err) {
      console.error("[WS Connection Handling Error]:", err);
      try {
        ws.close();
      } catch {}
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export const setupPromise = startServer().catch((err) => {
  console.error("Failed to start server:", err);
});