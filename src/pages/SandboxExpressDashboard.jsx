import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { 
  DollarSign, 
  ArrowLeft, 
  Lock, 
  TrendingUp, 
  Building2, 
  Calendar, 
  HelpCircle,
  RefreshCw,
  Clock,
  Music,
  ChevronRight,
  Disc,
  ExternalLink
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";
import { toast } from "sonner";

export default function SandboxExpressDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [balances, setBalances] = useState({
    vinyl_bits: 0,
    accumulated_bits_balance: 0,
    payout_method: null,
    payout_details: ""
  });
  const [loading, setLoading] = useState(true);

  // Fetch balances so our dashboard matches the user's live database balance
  const fetchBalances = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/users/me/vinyl-bits");
      setBalances(data);
    } catch (err) {
      console.error("Error fetching balances for Stripe Express Dashboard simulation:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [user]);

  // Translate bits balance to USD: 1 Bit = $0.01 USD
  const accumulatedUsd = ((balances.accumulated_bits_balance || 0) * 0.01).toFixed(2);
  const totalPaidOutUsd = 125.00; // Mock historical paid out volume

  // Mock analytics dataset
  const earningHistory = [
    { name: "Mon", tips: 12, bits: 1200 },
    { name: "Tue", tips: 24, bits: 2400 },
    { name: "Wed", tips: 15, bits: 1500 },
    { name: "Thu", tips: 35, bits: 3500 },
    { name: "Fri", tips: 58, bits: 5800 },
    { name: "Sat", tips: 82, bits: 8200 },
    { name: "Sun", tips: 45, bits: 4500 },
  ];

  const recentEvents = [
    { id: "tx_1", donor: "@subwoofer_head", bits: 500, time: "2 hours ago", track: "Sven Väth - Electrica Salsa" },
    { id: "tx_2", donor: "@techno_queen", bits: 1000, time: "4 hours ago", track: "Charlotte de Witte - Sgadi Li" },
    { id: "tx_3", donor: "@vinyl_purist", bits: 2500, time: "1 day ago", track: "Carl Cox - I Want You" },
    { id: "tx_4", donor: "@ambient_waves", bits: 500, time: "2 days ago", track: "Aphex Twin - Heliosphan" },
  ];

  return (
    <div className="min-h-screen bg-[#070709] font-mono text-zinc-300 flex flex-col justify-between" id="sandbox-express-dashboard-page">
      {/* Warning banner */}
      <div className="bg-purple-950/20 border-b border-purple-500/20 px-4 py-2 text-center text-[10px] text-purple-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
        <Lock className="h-3.5 w-3.5" />
        <span>SIMULATED STRIPE EXPRESS CREATOR HUB // SANDBOX TEST ENVIRONMENT</span>
      </div>

      <div className="flex-grow max-w-6xl w-full mx-auto px-4 py-8">
        
        {/* Navigation & Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-6 mb-8">
          <div className="space-y-1">
            <Link 
              to="/payouts"
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors uppercase font-bold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Sparkz Payouts</span>
            </Link>
            <div className="flex items-center gap-2 mt-1">
              <span className="bg-[#635bff] text-white text-[9px] font-bold font-mono px-2 py-0.5 uppercase tracking-wider">Stripe Express</span>
              <h1 className="text-xl font-black text-white uppercase tracking-widest">
                WELCOME BACK, @{user?.username || "creator"}
              </h1>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase">
              Manage your direct deposit banking, verify ledger statements, and view live tip analytics.
            </p>
          </div>

          <button 
            onClick={fetchBalances}
            disabled={loading}
            className="flex items-center gap-1.5 self-start sm:self-center border border-zinc-800 hover:border-zinc-700 bg-black text-zinc-400 text-[10px] py-2 px-3 uppercase tracking-wider transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span>SYNC DATA</span>
          </button>
        </div>

        {loading ? (
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-8 w-8 text-[#635bff] animate-spin" />
            <span className="text-xs uppercase tracking-widest text-zinc-500">// LOADING STRIPE SECURE CONNECTIONS...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left side: Quick balance stats */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Stat card 1: Available balance */}
              <div className="border border-zinc-800 bg-[#0c0c0e] p-5 rounded-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                  <DollarSign className="h-24 w-24 text-[#635bff]" />
                </div>
                <div className="text-[9px] uppercase tracking-widest text-[#635bff] font-bold mb-1">// REAL-TIME LEDGER</div>
                <h3 className="text-[10px] uppercase font-black text-zinc-400 tracking-wider">AVAILABLE FOR PAYOUT</h3>
                
                <div className="flex items-baseline gap-1 mt-2.5 mb-2">
                  <span className="text-4xl font-display font-black text-white">${accumulatedUsd}</span>
                  <span className="text-xs font-bold text-zinc-500">USD</span>
                </div>

                <div className="pt-3 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-500 uppercase">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Next Payout:
                  </span>
                  <span className="font-bold text-zinc-300">Sep 1, 2026 (Monthly)</span>
                </div>
              </div>

              {/* Stat card 2: Historical earnings */}
              <div className="border border-zinc-800 bg-[#050505] p-5 rounded-sm">
                <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-1">// HISTORIC DISPATCHES</div>
                <h3 className="text-[10px] uppercase font-black text-zinc-400 tracking-wider">TOTAL HISTORIC PAYOUTS</h3>
                
                <div className="flex items-baseline gap-1 mt-2 mb-1.5">
                  <span className="text-3xl font-display font-black text-zinc-300">${totalPaidOutUsd.toFixed(2)}</span>
                  <span className="text-xs font-bold text-zinc-600">USD</span>
                </div>
                
                <p className="text-[9px] text-zinc-600 uppercase leading-relaxed">
                  Sum of all successfully finalized monthly settlements dispatched via secure direct-deposit.
                </p>
              </div>

              {/* Bank destination card */}
              <div className="border border-zinc-800 bg-[#050505] p-5 rounded-sm space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                  <h3 className="text-[10px] uppercase font-black text-zinc-400 tracking-wider">DEPOSIT DESTINATION</h3>
                  <Building2 className="h-4 w-4 text-[#635bff]" />
                </div>

                <div className="space-y-1 bg-black p-2.5 border border-zinc-900 text-[10px] font-mono text-zinc-500 uppercase">
                  <div className="flex justify-between">
                    <span>Institution:</span>
                    <span className="text-zinc-300 font-bold">Stripe Test Bank</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Routing Number:</span>
                    <span className="text-zinc-300">•••••0025</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Account Ending:</span>
                    <span className="text-emerald-400 font-bold">••••7890</span>
                  </div>
                </div>
                
                <p className="text-[9px] text-zinc-600 uppercase leading-snug">
                  Payouts take 2-3 business days to settle in your balance once dispatched by the monthly settlement scheduler.
                </p>
              </div>

            </div>

            {/* Right side: Charts and Transactions */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Interactive analytics charts */}
              <div className="border border-zinc-800 bg-[#050505] p-5 rounded-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-900 pb-3 mb-4 gap-2">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-[#635bff] font-bold mb-1">// WEEKLY REVENUE METRICS</div>
                    <h3 className="text-[10px] uppercase font-black text-white tracking-widest flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-[#635bff]" />
                      <span>Vinyl Bits Supporting Revenue Trend</span>
                    </h3>
                  </div>
                  
                  <span className="text-[9px] bg-[#635bff]/10 border border-[#635bff]/30 text-[#635bff] font-bold font-mono px-2 py-0.5 rounded-sm uppercase tracking-wider">
                    Past 7 Days
                  </span>
                </div>

                {/* Chart component */}
                <div className="h-48 w-full pr-4 text-[10px] font-mono">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={earningHistory}>
                      <defs>
                        <linearGradient id="colorBits" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#635bff" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#635bff" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#52525b" />
                      <YAxis stroke="#52525b" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "#050505", 
                          border: "1px solid #27272a",
                          borderRadius: "0px",
                          fontFamily: "monospace"
                        }}
                      />
                      <Area type="monotone" dataKey="bits" name="Vinyl Bits" stroke="#635bff" strokeWidth={2} fillOpacity={1} fill="url(#colorBits)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent tips */}
              <div className="border border-zinc-800 bg-[#050505] p-5 rounded-sm">
                <div className="border-b border-zinc-900 pb-3 mb-4">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-1">// RECORD LOGS</div>
                  <h3 className="text-[10px] uppercase font-black text-white tracking-widest flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-zinc-500" />
                    <span>Recent Support Tip Transactions</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {recentEvents.map((ev) => (
                    <div 
                      key={ev.id}
                      className="border border-zinc-900 bg-black/40 p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-zinc-800 transition-all"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 border border-[#635bff]/20 bg-[#635bff]/5 rounded-xs shrink-0 mt-0.5">
                          <Music className="h-3.5 w-3.5 text-[#635bff]" />
                        </div>
                        <div>
                          <div className="text-xs text-white uppercase font-bold">{ev.donor}</div>
                          <div className="text-[9px] text-zinc-500 uppercase mt-0.5 flex items-center gap-1.5">
                            <Disc className="h-2.5 w-2.5 text-zinc-700 animate-spin-slow" />
                            <span>Track: {ev.track}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right self-end sm:self-center">
                        <div className="text-xs font-bold text-[#e5ff00] flex items-center gap-1 justify-end">
                          <span>+{ev.bits.toLocaleString()} Bits</span>
                        </div>
                        <div className="text-[9px] text-zinc-600 uppercase font-mono mt-0.5">{ev.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* Footer */}
      <div className="border-t border-zinc-900 bg-black/40 px-4 py-4 text-center text-[9px] text-zinc-600 uppercase tracking-wider flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>© 2026 STRIPE INC. // EXPERIMENT DIRECT LEDGERS</span>
        <span className="flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          <span>AUTHORIZED SECURE COMPLIANCE ENVIRONMENT</span>
        </span>
      </div>
    </div>
  );
}
