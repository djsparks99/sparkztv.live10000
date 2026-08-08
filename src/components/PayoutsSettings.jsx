import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { 
  CreditCard, 
  ExternalLink, 
  RefreshCw, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle,
  XCircle
} from "lucide-react";

export default function PayoutsSettings({ onStatusChange }) {
  const [loading, setLoading] = useState(true);
  const [connectId, setConnectId] = useState(null);
  const [connectStatus, setConnectStatus] = useState("none");
  const [isReal, setIsReal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch current Stripe Connect status
  const fetchConnectStatus = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get("/stripe/connect/status");
      if (data.linked) {
        setConnectId(data.accountId);
        setConnectStatus(data.status);
        setIsReal(data.real);
        if (onStatusChange) {
          onStatusChange(data.status, data.accountId);
        }
      } else {
        setConnectId(null);
        setConnectStatus("none");
        setIsReal(false);
        if (onStatusChange) {
          onStatusChange("none", null);
        }
      }
    } catch (err) {
      console.error("[Stripe Connect] Failed to retrieve status:", err);
      if (!silent) {
        toast.error("Failed to fetch Stripe Connect account status.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // Check if we came back from a Connect redirection success/refresh
    const params = new URLSearchParams(window.location.search);
    const connectSuccess = params.get("connect_success");
    const accountId = params.get("account_id");
    const isSimulated = params.get("simulated_connect");

    if (connectSuccess && accountId) {
      const verifyConnectOnboarding = async () => {
        setLoading(true);
        try {
          toast.loading("Verifying your Stripe connected account...", { id: "stripe-connect-verify" });
          const { data } = await api.post("/stripe/connect/verify-onboarding", {
            accountId,
            isSimulated: isSimulated === "true"
          });
          
          toast.success(data.message || "Stripe Connect linked successfully!", { id: "stripe-connect-verify" });
          
          // Clear query params from browser URL so page refreshing doesn't replay
          const url = new URL(window.location.href);
          url.searchParams.delete("connect_success");
          url.searchParams.delete("account_id");
          url.searchParams.delete("simulated_connect");
          url.searchParams.delete("connect_refresh");
          window.history.replaceState({}, document.title, url.toString());
          
          fetchConnectStatus();
        } catch (err) {
          toast.error(apiErrorMessage(err) || "Failed to complete Stripe Connect linking.", { id: "stripe-connect-verify" });
          fetchConnectStatus();
        }
      };
      verifyConnectOnboarding();
    } else {
      fetchConnectStatus();
    }
  }, []);

  const handleLinkStripe = async () => {
    setActionLoading(true);
    try {
      toast.loading("Preparing secure Stripe Connect onboarding session...", { id: "stripe-onboard" });
      const { data } = await api.post("/stripe/connect/onboard");
      
      if (data.success && data.url) {
        toast.success(data.real ? "Redirecting to Stripe Express Portal..." : "Redirecting to sandbox onboarding simulation...", { id: "stripe-onboard" });
        setTimeout(() => {
          window.location.href = data.url;
        }, 1000);
      } else {
        toast.error("Failed to create Stripe Connect session.", { id: "stripe-onboard" });
        setActionLoading(false);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err) || "Stripe Connect initiation failed.", { id: "stripe-onboard" });
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Are you sure you want to unlink your Stripe Connect account? You will need to link it again to receive future Vinyl Bits payouts.")) {
      return;
    }
    setActionLoading(true);
    try {
      toast.loading("Unlinking Stripe account...", { id: "stripe-disconnect" });
      const { data } = await api.post("/stripe/connect/disconnect");
      toast.success(data.message || "Stripe Connect account removed.", { id: "stripe-disconnect" });
      setConnectId(null);
      setConnectStatus("none");
      setIsReal(false);
      if (onStatusChange) {
        onStatusChange("none", null);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err) || "Failed to unlink Stripe Connect account.", { id: "stripe-disconnect" });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 border border-zinc-800 bg-zinc-950/40 p-4 space-y-2">
        <RefreshCw className="h-5 w-5 text-[#e5ff00] animate-spin" />
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">// LOADING STRIPE CONNECT PORTAL...</span>
      </div>
    );
  }

  // Mask Connected Account ID for visual privacy
  const formatAccountId = (id) => {
    if (!id) return "";
    if (id.length <= 10) return id;
    return `${id.substring(0, 7)}••••••••${id.substring(id.length - 4)}`;
  };

  return (
    <div className="border border-zinc-800 bg-[#050505] p-5 space-y-4" id="stripe-connect-settings">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">// SECURE LEDGER SETTINGS</div>
          <h2 className="text-xs uppercase font-black text-white tracking-widest mt-0.5">STRIPE CONNECT DIRECT DEPOSIT</h2>
        </div>
        <CreditCard className="h-5 w-5 text-[#e5ff00]" />
      </div>

      {connectStatus === "none" && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-400 leading-relaxed uppercase">
            Link your personal or business bank account securely using **Stripe Connect Express**. Monthly Vinyl Bits revenues will be direct-deposited straight to your bank account with zero manually processed wait periods.
          </p>

          <div className="space-y-2.5 bg-zinc-950/40 border border-zinc-900 p-3 text-[11px] font-mono text-zinc-400">
            <div className="flex items-start gap-2">
              <span className="text-[#e5ff00] font-bold">»</span>
              <span>**No Account Info Stored**: Bank detail logins and Routing numbers are entered directly inside Stripe's PCI-compliant server. Our platform stores nothing.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#e5ff00] font-bold">»</span>
              <span>**Automated Settlements**: At midnight on the 1st of every month, your Vinyl Bits balance is converted into USD and dispatched.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#e5ff00] font-bold">»</span>
              <span>**Tax Preparation**: Receive automated 1099 form exports generated automatically when earnings thresholds are crossed.</span>
            </div>
          </div>

          <button
            type="button"
            disabled={actionLoading}
            onClick={handleLinkStripe}
            className="w-full btn-primary text-xs py-2.5 uppercase font-black tracking-widest flex items-center justify-center gap-2"
          >
            <span>LINK BANK VIA STRIPE CONNECT</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {connectStatus === "pending_onboarding" && (
        <div className="space-y-4 border border-yellow-950/40 bg-yellow-950/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-wider">ONBOARDING INCOMPLETE</h3>
              <p className="text-[11px] text-zinc-400 mt-1 uppercase leading-relaxed">
                You initialized Stripe Connect, but did not complete the identity verification or bank details linkage inside the secure Stripe portal.
              </p>
            </div>
          </div>

          {connectId && (
            <div className="border border-zinc-900 bg-black/80 px-3 py-2 text-[10px] font-mono text-zinc-500 flex justify-between items-center">
              <span>CONNECT ID:</span>
              <span className="text-zinc-300 font-bold">{formatAccountId(connectId)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleLinkStripe}
              className="btn-primary text-[10px] py-2 uppercase font-black tracking-widest flex items-center justify-center gap-1.5"
            >
              <span>RESUME ONBOARDING</span>
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => fetchConnectStatus(false)}
              className="border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 text-[10px] py-2 uppercase font-bold tracking-widest flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${actionLoading ? "animate-spin" : ""}`} />
              <span>SYNC STATUS</span>
            </button>
          </div>

          <div className="pt-2 border-t border-zinc-900 flex justify-end">
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-[9px] uppercase tracking-wider text-zinc-600 hover:text-red-400 transition-colors"
            >
              // CANCEL & DISCONNECT STRIPE
            </button>
          </div>
        </div>
      )}

      {connectStatus === "active" && (
        <div className="space-y-4 border border-emerald-950/40 bg-emerald-950/5 p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                <span>STRIPE CONNECT: ACTIVE</span>
                <span className="bg-emerald-500/20 text-emerald-400 text-[8px] font-bold font-mono px-1.5 py-0.5 uppercase tracking-normal">DIRECT DEPOSIT ENABLED</span>
              </h3>
              <p className="text-[11px] text-zinc-400 mt-1 uppercase leading-relaxed">
                Your payouts configuration is fully secured. Monthly revenues will automatically process directly to your connected bank account.
              </p>
            </div>
          </div>

          <div className="border border-zinc-900 bg-black/80 px-3 py-2 text-[10px] font-mono text-zinc-500 space-y-1">
            <div className="flex justify-between items-center">
              <span>CONNECTED BANK ID:</span>
              <span className="text-emerald-400 font-bold">{formatAccountId(connectId)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>LEDGER SYNC MODE:</span>
              <span className="text-zinc-300">{isReal ? "REAL-TIME SECURE STRIPE" : "[SIMULATED TESTBED LINK]"}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <a
              href={isReal ? "https://dashboard.stripe.com" : "#"}
              target={isReal ? "_blank" : undefined}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!isReal) {
                  e.preventDefault();
                  toast.info("In Sandbox mode, Stripe Express dashboard links are simulated.");
                }
              }}
              className="border border-zinc-800 bg-zinc-950 text-[#e5ff00] hover:border-[#e5ff00] text-[10px] py-2 uppercase font-bold tracking-widest flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>STRIPE EXPRESS PORTAL</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleDisconnect}
              className="border border-zinc-900 hover:border-red-950 bg-zinc-950 text-zinc-500 hover:text-red-400 text-[10px] py-2 uppercase font-bold tracking-widest flex items-center justify-center gap-1.5 transition-colors"
            >
              <XCircle className="h-3 w-3" />
              <span>UNLINK ACCOUNT</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
