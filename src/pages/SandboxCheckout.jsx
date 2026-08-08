import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { 
  CreditCard, 
  Lock, 
  ArrowLeft, 
  ShieldCheck, 
  RefreshCw, 
  Coins, 
  Disc, 
  CheckCircle2 
} from "lucide-react";
import { toast } from "sonner";

export default function SandboxCheckout() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const sessionId = searchParams.get("session_id") || `cs_test_${Math.random().toString(36).substring(2, 12)}`;
  const amountStr = searchParams.get("amount") || "1000";
  const amount = parseInt(amountStr, 10) || 1000;
  const priceUsd = (amount * 0.01).toFixed(2);

  const [email, setEmail] = useState(user?.email || "");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [nameOnCard, setNameOnCard] = useState(user?.username || "");
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  // Auto-format card number
  const handleCardChange = (e) => {
    let val = e.target.value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    let matches = val.match(/\d{4,16}/g);
    let match = (matches && matches[0]) || "";
    let parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      setCardNumber(parts.join(" "));
    } else {
      setCardNumber(val);
    }
  };

  // Auto-format expiry
  const handleExpiryChange = (e) => {
    let val = e.target.value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    if (val.length >= 2) {
      setExpiry(`${val.substring(0, 2)}/${val.substring(2, 4)}`);
    } else {
      setExpiry(val);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter a valid email address.");
      return;
    }
    const cleanCard = cardNumber.replace(/\s+/g, "");
    if (cleanCard.length < 16) {
      toast.error("Please enter a valid 16-digit card number.");
      return;
    }
    if (expiry.length < 5) {
      toast.error("Please enter a valid expiry date (MM/YY).");
      return;
    }
    if (cvc.length < 3) {
      toast.error("Please enter a valid 3-digit CVC/CVV.");
      return;
    }
    if (!nameOnCard.trim()) {
      toast.error("Please enter the name on the card.");
      return;
    }

    setProcessing(true);
    
    // Simulate high-fidelity network request to Stripe test environment
    setTimeout(() => {
      setProcessing(false);
      setDone(true);
      toast.success("Payment authorized by simulated Stripe gateway!");
      
      setTimeout(() => {
        // Redirect back to payouts success url
        window.location.href = `/payouts?session_id=${sessionId}&purchase_success=true&amount=${amount}&simulated_checkout=true`;
      }, 1500);
    }, 2500);
  };

  const fillTestCard = () => {
    setCardNumber("4242 4242 4242 4242");
    setExpiry("12/29");
    setCvc("424");
    setNameOnCard(user?.username || "TEST USER");
    toast.info("Auto-filled simulated Stripe test card details.");
  };

  return (
    <div className="min-h-screen bg-[#070709] font-mono text-zinc-300 flex flex-col justify-between" id="sandbox-checkout-page">
      {/* Top Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-[10px] text-amber-500 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
        <Lock className="h-3.5 w-3.5 animate-pulse" />
        <span>STRIPE SANDBOX INTERACTIVE SIMULATOR // NO ACTUAL FUNDS WILL BE CHARGED</span>
      </div>

      <div className="flex-grow max-w-5xl w-full mx-auto px-4 py-8 md:py-16 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left column: Order Summary */}
        <div className="md:col-span-5 space-y-6">
          <button 
            onClick={() => navigate("/payouts")}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors uppercase font-bold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Cancel & Return</span>
          </button>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[#e5ff00] font-bold text-sm tracking-wider uppercase font-display border border-[#e5ff00]/40 bg-[#e5ff00]/5 px-2 py-0.5">SPARKZ.TV</span>
              <span className="text-zinc-600 text-xs">CHECKOUT</span>
            </div>
            <h1 className="text-2xl font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-6 w-6 text-[#e5ff00] fill-[#e5ff00]/20" />
              <span>Purchase Vinyl Bits</span>
            </h1>
          </div>

          <div className="border-t border-b border-zinc-900 py-4 my-2 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xs font-bold text-white uppercase">{amount.toLocaleString()} Vinyl Bits Bundle</h4>
                <p className="text-[10px] text-zinc-500 uppercase mt-0.5">100% direct-to-streamer supporting balance</p>
              </div>
              <span className="text-sm font-bold text-white">${priceUsd}</span>
            </div>

            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Platform Fee (0%)</span>
              <span className="text-emerald-500 font-bold">$0.00</span>
            </div>
            
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Simulated Network Taxes</span>
              <span>$0.00</span>
            </div>
          </div>

          <div className="flex justify-between items-baseline pt-2">
            <span className="text-xs uppercase font-bold text-zinc-400">Total Due Today:</span>
            <span className="text-3xl font-display font-black text-[#e5ff00]">${priceUsd}</span>
          </div>

          <div className="border border-zinc-900 bg-zinc-950/40 p-3 text-[10px] text-zinc-500 space-y-2 leading-relaxed uppercase">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                **Secured by Stripe Sandbox Relay**. Payments are routed mock-side to simulate complete end-to-end user credit sync and verify ledger capabilities safely.
              </span>
            </div>
          </div>
        </div>

        {/* Right column: Form */}
        <div className="md:col-span-7 border border-zinc-800 bg-[#050505] p-6 md:p-8 rounded-sm relative">
          {processing && (
            <div className="absolute inset-0 z-10 bg-black/90 flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="h-8 w-8 text-[#e5ff00] animate-spin" />
              <div className="text-xs uppercase tracking-widest text-[#e5ff00] font-bold">CONTACTING STRIPE SANDBOX NETWORK...</div>
              <div className="text-[9px] text-zinc-600 uppercase font-mono">Verifying credentials and authorizing simulated ledger balance</div>
            </div>
          )}

          {done && (
            <div className="absolute inset-0 z-10 bg-black/95 flex flex-col items-center justify-center space-y-4 text-center px-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-bounce" />
              <div className="text-sm uppercase tracking-widest text-emerald-400 font-bold">PAYMENT COMPLETED SUCCESSFULLY</div>
              <div className="text-[10px] text-zinc-500 uppercase max-w-xs leading-relaxed">
                Thank you! Simulated payment has gone through. Crediting **{amount.toLocaleString()} Vinyl Bits** to your account. Redirecting you back...
              </div>
            </div>
          )}

          <div className="flex justify-between items-center border-b border-zinc-900 pb-4 mb-6">
            <h3 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-[#e5ff00]" />
              <span>Secure Card Checkout</span>
            </h3>
            
            <button
              type="button"
              onClick={fillTestCard}
              className="text-[9px] font-bold uppercase text-[#e5ff00] hover:bg-[#e5ff00]/10 border border-[#e5ff00]/30 px-2 py-1 transition-all"
            >
              🚀 Auto-fill Test Card
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500">Contact Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-black border border-zinc-800 focus:border-[#e5ff00] px-3 py-2.5 outline-none text-white transition-colors uppercase"
              />
            </div>

            {/* Card Information */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500">Card Information</label>
              <div className="relative">
                <input 
                  type="text" 
                  required
                  value={cardNumber}
                  onChange={handleCardChange}
                  maxLength={19}
                  placeholder="4242 4242 4242 4242"
                  className="w-full bg-black border border-zinc-800 focus:border-[#e5ff00] pl-10 pr-3 py-2.5 outline-none text-white transition-colors"
                />
                <CreditCard className="absolute left-3 top-3.5 h-4 w-4 text-zinc-600" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input 
                    type="text" 
                    required
                    maxLength={5}
                    value={expiry}
                    onChange={handleExpiryChange}
                    placeholder="MM/YY"
                    className="w-full bg-black border border-zinc-800 focus:border-[#e5ff00] px-3 py-2.5 outline-none text-white transition-colors text-center"
                  />
                </div>
                <div>
                  <input 
                    type="password" 
                    required
                    maxLength={4}
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/[^0-9]/gi, ""))}
                    placeholder="CVC"
                    className="w-full bg-black border border-zinc-800 focus:border-[#e5ff00] px-3 py-2.5 outline-none text-white transition-colors text-center"
                  />
                </div>
              </div>
            </div>

            {/* Cardholder Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500">Name on Card</label>
              <input 
                type="text" 
                required
                value={nameOnCard}
                onChange={(e) => setNameOnCard(e.target.value)}
                placeholder="Name Surname"
                className="w-full bg-black border border-zinc-800 focus:border-[#e5ff00] px-3 py-2.5 outline-none text-white transition-colors uppercase"
              />
            </div>

            {/* Simulated testbed alert banner */}
            <div className="border border-dashed border-zinc-800 bg-zinc-950 p-3 text-[10px] font-mono text-zinc-500 space-y-1 uppercase leading-snug">
              <div className="font-bold text-[#e5ff00]">💡 TESTING INSTRUCTIONS:</div>
              <div>Use Stripe's simulated payment testing profile:</div>
              <div>Card: <span className="text-zinc-300 font-bold select-all">4242 4242 4242 4242</span></div>
              <div>Expiry: <span className="text-zinc-300">Any future date</span> | CVC: <span className="text-zinc-300">Any 3 digits</span></div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#e5ff00] hover:bg-[#c7de00] text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(229,255,0,0.1)] hover:shadow-[0_0_25px_rgba(229,255,0,0.25)]"
            >
              <span>PAY ${priceUsd}</span>
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-900 bg-black/40 px-4 py-4 text-center text-[9px] text-zinc-600 uppercase tracking-wider flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>© 2026 SPARKZ.TV // SECURE PAYMENT DEMO</span>
        <span className="flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          <span>POWERED BY STRIPE SANDBOX ENGINE</span>
        </span>
      </div>
    </div>
  );
}
