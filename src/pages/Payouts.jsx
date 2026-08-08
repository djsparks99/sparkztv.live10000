import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import PayoutsSettings from "@/components/PayoutsSettings";
import { 
  Coins, 
  DollarSign, 
  CreditCard, 
  ArrowRight, 
  History, 
  RefreshCw, 
  Sparkles, 
  Disc
} from "lucide-react";

export default function Payouts() {
  const { user } = useAuth();
  
  // States
  const [balances, setBalances] = useState({
    vinyl_bits: 0,
    accumulated_bits_balance: 0,
    payout_method: null,
    payout_details: ""
  });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState("paypal");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [payoutsHistory, setPayoutsHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  
  // Purchase State
  const [purchaseAmount, setPurchaseAmount] = useState(1000);
  const [purchasing, setPurchasing] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  
  // Fetch balances and history
  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data } = await api.get("/users/me/vinyl-bits");
      setBalances(data);
      setPayoutMethod(data.payout_method || "paypal");
      setPayoutDetails(data.payout_details || "");
    } catch (err) {
      console.error("Error fetching vinyl bits details:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    try {
      setHistoryLoading(true);
      const { data } = await api.get("/users/me/payouts/history");
      setPayoutsHistory(data.payouts || []);
    } catch (err) {
      console.error("Error fetching payouts history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const success = params.get("purchase_success");
    const amount = params.get("amount");
    const autoBuy = params.get("buy") === "true";

    if (autoBuy) {
      setShowPurchaseModal(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("buy");
      window.history.replaceState({}, document.title, url.toString());
    }

    if (sessionId && success && amount) {
      const verifyStripePayment = async () => {
        try {
          toast.loading("Verifying transaction with Stripe network...", { id: "stripe-verify" });
          const { data } = await api.post("/stripe/verify-session", {
            sessionId: sessionId,
            amount: parseInt(amount, 10)
          });
          toast.success(data.message || "Vinyl Bits added successfully!", { id: "stripe-verify" });
          
          // Clear query params from browser URL so page refreshing doesn't replay
          const url = new URL(window.location.href);
          url.searchParams.delete("session_id");
          url.searchParams.delete("purchase_success");
          url.searchParams.delete("amount");
          url.searchParams.delete("simulated_checkout");
          window.history.replaceState({}, document.title, url.toString());
          
          fetchData();
        } catch (err) {
          toast.error("Stripe verification failed. Please contact support.", { id: "stripe-verify" });
        }
      };
      verifyStripePayment();
    } else {
      fetchData();
    }
    fetchHistory();
  }, [user]);

  // Save Config
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!payoutDetails.trim()) {
      toast.error("Please enter valid details for the payout method.");
      return;
    }
    
    setSavingConfig(true);
    try {
      const { data } = await api.post("/users/me/payouts/config", {
        method: payoutMethod,
        details: payoutDetails
      });
      setBalances(prev => ({
        ...prev,
        payout_method: data.payout_method,
        payout_details: data.payout_details
      }));
      toast.success("Payout preferences configured & synced successfully!");
    } catch (err) {
      toast.error(apiErrorMessage(err) || "Failed to update payout configuration.");
    } finally {
      setSavingConfig(false);
    }
  };

  // Buy Bits via Stripe Checkout Session
  const handlePurchaseBits = async () => {
    setPurchasing(true);
    try {
      toast.loading("Initiating Stripe Checkout secure session...", { id: "stripe-checkout" });
      const { data } = await api.post("/stripe/create-checkout-session", {
        amount: purchaseAmount
      });
      
      if (data.success && data.url) {
        toast.success("Checkout session created! Redirecting to secure portal...", { id: "stripe-checkout" });
        setTimeout(() => {
          window.location.href = data.url;
        }, 1000);
      } else {
        toast.error("Failed to create checkout session.", { id: "stripe-checkout" });
      }
    } catch (err) {
      toast.error(apiErrorMessage(err) || "Failed to initiate purchase session.", { id: "stripe-checkout" });
    } finally {
      setPurchasing(false);
      setShowPurchaseModal(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 font-mono text-white min-h-screen">
      
      {/* Title Header */}
      <div className="border-b border-[#27272a] pb-6 mb-8">
        <h1 className="font-display text-2xl font-black uppercase tracking-widest text-white flex items-center gap-2">
          <Coins className="h-6 w-6 text-[#e5ff00]" />
          <span>PAYOUT HUB // VINYL BITS</span>
        </h1>
        <p className="text-xs text-zinc-500 mt-2 max-w-2xl uppercase">
          Configure streamer payout configurations, check your support ledger, and buy/spend Vinyl Bits.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-8 w-8 text-[#e5ff00] animate-spin" />
          <span className="text-xs uppercase tracking-widest text-zinc-500">// SYNCHRONIZING WITH BLOCKCHAIN LEDGER...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT SIDEBAR CONTROLS */}
          <div className="lg:col-span-1 space-y-8">
            
            {/* 1. ACCUMULATED BALANCE CARD */}
            <div className="border border-zinc-800 bg-[#050505] p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                <Disc className="h-32 w-32 text-white animate-spin-slow" />
              </div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">// STREAMER REVENUES</div>
              <h2 className="text-xs uppercase font-black text-white tracking-widest mb-4">ACCUMULATED BALANCE</h2>
              
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-display font-black text-[#e5ff00]" data-testid="accumulated-bits-text">
                  {balances.accumulated_bits_balance?.toLocaleString() || 0}
                </span>
                <span className="text-xs font-bold text-zinc-400">BITS</span>
              </div>
              
              <div className="flex items-center gap-1.5 border-t border-zinc-900 pt-3 text-xs text-zinc-400">
                <DollarSign className="h-4 w-4 text-[#e5ff00]" />
                <span>Estimated Value: </span>
                <span className="font-bold text-white">${((balances.accumulated_bits_balance || 0) * 0.01).toFixed(2)} USD</span>
              </div>
              <p className="text-[9px] text-zinc-500 mt-1 uppercase">
                100% of purchase price goes directly to streamer. NO platform cuts.
              </p>
            </div>

            {/* 2. PAYOUT METHOD SETUP (STRIPE CONNECT INTEGRATION) */}
            <PayoutsSettings onStatusChange={(status, id) => {
              setBalances(prev => ({
                ...prev,
                payout_method: status === "active" ? "stripe_connect" : null,
                payout_details: id || ""
              }));
              setPayoutMethod(status === "active" ? "stripe" : "paypal");
              setPayoutDetails(id || "");
              fetchHistory();
            }} />

            {/* 3. WALLET DETAILS / SANDBOX PURCHASER */}
            <div className="border border-zinc-800 bg-[#050505] p-5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">// SUPPORTER WALLET</div>
              <h2 className="text-xs uppercase font-black text-white tracking-widest mb-4">YOUR WALLET</h2>
              
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4">
                <span className="text-xs text-zinc-400">Vinyl Bits Balance:</span>
                <span className="text-lg font-bold text-white flex items-center gap-1">
                  <Coins className="h-4 w-4 text-[#e5ff00]" />
                  {balances.vinyl_bits?.toLocaleString() || 0}
                </span>
              </div>

              <button
                onClick={() => setShowPurchaseModal(true)}
                className="w-full border border-dashed border-[#e5ff00]/40 text-[#e5ff00] hover:border-[#e5ff00] bg-[#e5ff00]/5 hover:bg-[#e5ff00]/10 py-2 px-3 text-xs uppercase font-bold flex items-center justify-center gap-2 transition-all"
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>LOAD VINYL BITS</span>
              </button>
            </div>

          </div>

          {/* MAIN PANELS */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* 4. PAYOUT LEDGER TABLE */}
            <div className="border border-zinc-800 bg-[#050505] p-6">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">// SETTLEMENT HISTORIC</div>
                  <h2 className="text-xs uppercase font-black text-white tracking-widest flex items-center gap-1.5">
                    <History className="h-4 w-4 text-zinc-400" />
                    <span>PAYOUT HISTORY LEDGER</span>
                  </h2>
                </div>
                <button 
                  onClick={fetchHistory}
                  disabled={historyLoading}
                  className="text-[10px] border border-zinc-800 hover:border-zinc-700 bg-black text-zinc-400 p-2 uppercase flex items-center gap-1 transition-all"
                >
                  <RefreshCw className={`h-3 w-3 ${historyLoading ? "animate-spin" : ""}`} />
                  <span>RELOAD</span>
                </button>
              </div>

              {historyLoading ? (
                <div className="py-12 text-center text-xs uppercase text-zinc-600">// CHARGING HISTORIC RECORDS...</div>
              ) : payoutsHistory.length === 0 ? (
                <div className="py-12 text-center">
                  <History className="mx-auto h-8 w-8 text-zinc-800 mb-2" />
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">// NO PAYOUT TRANSACTIONS COMPLETED YET</div>
                  <p className="text-[9px] text-zinc-600 mt-1 uppercase">Automated end-of-the-month cycles will compile and post settlements here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[11px] whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-zinc-900 text-zinc-500">
                        <th className="pb-2 uppercase tracking-wider font-bold">PAYOUT ID</th>
                        <th className="pb-2 uppercase tracking-wider font-bold">DATE</th>
                        <th className="pb-2 uppercase tracking-wider font-bold text-right">BITS ACCRUED</th>
                        <th className="pb-2 uppercase tracking-wider font-bold text-right">NET USD</th>
                        <th className="pb-2 uppercase tracking-wider font-bold">METHOD</th>
                        <th className="pb-2 uppercase tracking-wider font-bold text-center">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {payoutsHistory.map((p) => (
                        <tr key={p.id} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="py-3 font-semibold text-zinc-300">#{p.id.slice(4, 12)}</td>
                          <td className="py-3 text-zinc-400">{new Date(p.created_at).toLocaleDateString()}</td>
                          <td className="py-3 font-bold text-right text-white">{(p.amount_bits || p.amountBits)?.toLocaleString()}</td>
                          <td className="py-3 font-bold text-right text-[#e5ff00]">${(p.amount_usd || p.amountUsd)?.toFixed(2)}</td>
                          <td className="py-3 uppercase text-zinc-400">{p.payout_method || p.payoutMethod}</td>
                          <td className="py-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 text-[9px] font-bold uppercase ${
                              p.status === "paid" 
                                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                                : p.status === "processing"
                                ? "bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse"
                                : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                            }`}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* REAL VINYL BITS PURCHASE MODAL */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div 
            className="w-full max-w-md border border-[#e5ff00]/50 bg-[#0c0c0e] p-6 shadow-[0_0_25px_rgba(229,255,0,0.15)] rounded-sm relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-900 pb-3 mb-4">
              <h3 className="font-display text-sm font-black uppercase tracking-widest text-[#e5ff00] flex items-center gap-1.5">
                <Coins className="h-5 w-5 fill-[#e5ff00]" />
                <span>PURCHASE VINYL BITS (STRIPE)</span>
              </h3>
              <p className="text-[10px] text-zinc-400 uppercase mt-1">Select bits density bundle. 100% funds directed directly to the streamers you support.</p>
            </div>

            <div className="space-y-3 mb-6">
              {[
                { bits: 500, price: "$5.00" },
                { bits: 1000, price: "$10.00" },
                { bits: 2500, price: "$25.00" },
                { bits: 5000, price: "$50.00" },
              ].map((tier) => (
                <button
                  key={tier.bits}
                  onClick={() => setPurchaseAmount(tier.bits)}
                  className={`w-full p-3 border text-xs uppercase flex items-center justify-between transition-all ${
                    purchaseAmount === tier.bits 
                      ? "border-[#e5ff00] bg-[#e5ff00]/10 text-[#e5ff00] font-bold" 
                      : "border-zinc-800 bg-black text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Coins className="h-4 w-4" />
                    <span>{tier.bits.toLocaleString()} Vinyl Bits</span>
                  </span>
                  <span className="font-bold">{tier.price}</span>
                </button>
              ))}
            </div>

            {/* SECURE STRIPE GATEWAY BLOCK */}
            <div className="border border-zinc-900 bg-black/80 p-3 mb-6 space-y-2">
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest">// SECURE STRIPE PORTAL</div>
              <div className="flex items-center gap-2 text-xs text-zinc-400 border border-zinc-800 p-2 bg-zinc-950">
                <CreditCard className="h-4 w-4 text-[#e5ff00]" />
                <span className="font-mono text-zinc-400">Cards, Apple Pay, Google Pay, Local Options</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowPurchaseModal(false)}
                className="px-4 py-2 border border-zinc-800 bg-black text-zinc-400 text-xs font-bold uppercase tracking-widest hover:border-zinc-700 transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={handlePurchaseBits}
                disabled={purchasing}
                className="px-5 py-2 bg-[#e5ff00] text-black font-black text-xs uppercase tracking-widest hover:bg-[#c7de00] transition-all flex items-center gap-1.5"
              >
                {purchasing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <span>CHECKOUT</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}