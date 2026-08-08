import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { 
  Building2, 
  User, 
  Briefcase, 
  CreditCard, 
  Lock, 
  ArrowRight, 
  CheckCircle2, 
  RefreshCw, 
  ShieldAlert 
} from "lucide-react";
import { toast } from "sonner";

export default function SandboxStripeOnboarding() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const accountId = searchParams.get("account_id") || `acct_sim_${user?.uid?.substring(0, 10) || "default"}`;

  // Form states
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("+1 (555) 019-2834");
  const [legalName, setLegalName] = useState(user?.username ? `${user.username.toUpperCase()} ENTERPRISES` : "JOHN DOE");
  const [dob, setDob] = useState("1995-05-12");
  const [routingNumber, setRoutingNumber] = useState("111000025"); // Chase Routing
  const [accountNumber, setAccountNumber] = useState("1234567890");
  const [submitting, setSubmitting] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  const handleNextStep = (e) => {
    e?.preventDefault();
    if (step < 3) {
      setStep(prev => prev + 1);
    } else {
      handleCompleteOnboarding();
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(prev => prev - 1);
    }
  };

  const handleCompleteOnboarding = () => {
    if (!routingNumber.trim() || !accountNumber.trim()) {
      toast.error("Please enter routing and account numbers.");
      return;
    }
    setSubmitting(true);
    toast.loading("Submitting compliance documents to Stripe gateway...", { id: "stripe-submit" });

    // Simulate multi-step onboarding verification pipeline
    setTimeout(() => {
      toast.loading("Verifying routing credentials and establishing bank link...", { id: "stripe-submit" });
    }, 1200);

    setTimeout(() => {
      setSubmitting(false);
      setOnboarded(true);
      toast.success("Merchant onboarding completed successfully!", { id: "stripe-submit" });

      setTimeout(() => {
        // Redirect back to SPARKZ.TV payouts success URL
        window.location.href = `/payouts?connect_success=true&account_id=${accountId}&simulated_connect=true`;
      }, 1500);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-[#070709] font-mono text-zinc-300 flex flex-col justify-between" id="sandbox-onboarding-page">
      {/* Top Warning banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-[10px] text-amber-500 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
        <Lock className="h-3.5 w-3.5 animate-pulse" />
        <span>STRIPE CONNECT EXPRESS ONBOARDING SANDBOX // NOT AN OFFICIAL STRIPE MERCHANDISING PORTAL</span>
      </div>

      <div className="flex-grow max-w-4xl w-full mx-auto px-4 py-8 md:py-16 flex items-center justify-center">
        <div className="w-full max-w-xl border border-zinc-800 bg-[#050505] rounded-sm p-6 md:p-8 relative">
          
          {submitting && (
            <div className="absolute inset-0 z-10 bg-black/90 flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="h-8 w-8 text-[#e5ff00] animate-spin" />
              <div className="text-xs uppercase tracking-widest text-[#e5ff00] font-bold">PROVISIONING EXPRESS MERCHANT ID...</div>
              <div className="text-[9px] text-zinc-600 uppercase font-mono">Registering bank account link & routing direct-deposit credentials</div>
            </div>
          )}

          {onboarded && (
            <div className="absolute inset-0 z-10 bg-black/95 flex flex-col items-center justify-center space-y-4 text-center px-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-bounce" />
              <div className="text-sm uppercase tracking-widest text-emerald-400 font-bold">ONBOARDING COMPLETED</div>
              <div className="text-[10px] text-zinc-500 uppercase max-w-xs leading-relaxed">
                Stripe Direct-Deposit capabilities activated for bank routing ending in **{accountNumber.slice(-4)}**. Connecting ledger...
              </div>
            </div>
          )}

          {/* Stripe Header */}
          <div className="flex justify-between items-center border-b border-zinc-900 pb-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-[#635bff] font-black text-lg tracking-wider uppercase">stripe</span>
              <span className="text-zinc-600 font-bold text-xs">/ express onboard</span>
            </div>
            
            {/* Step indicators */}
            <div className="flex gap-1.5">
              {[1, 2, 3].map((s) => (
                <div 
                  key={s} 
                  className={`h-1 w-6 rounded-full transition-all duration-300 ${
                    s === step 
                      ? "bg-[#635bff]" 
                      : s < step 
                      ? "bg-emerald-500" 
                      : "bg-zinc-800"
                  }`} 
                />
              ))}
            </div>
          </div>

          <form onSubmit={handleNextStep} className="space-y-4 text-xs">
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                    <User className="h-4 w-4 text-[#635bff]" />
                    <span>Step 1: Contact & Verification</span>
                  </h3>
                  <p className="text-[10px] text-zinc-500 uppercase">Provide your email & phone to secure your Stripe Express profile.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Business Email</label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full bg-black border border-zinc-800 focus:border-[#635bff] px-3 py-2.5 outline-none text-white transition-colors uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Mobile Phone</label>
                  <input 
                    type="text" 
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full bg-black border border-zinc-800 focus:border-[#635bff] px-3 py-2.5 outline-none text-white transition-colors"
                  />
                </div>

                <div className="border border-zinc-900 bg-zinc-950/40 p-3 text-[10px] text-zinc-500 uppercase leading-relaxed">
                  Stripe sends verification codes via mobile phone. A sandbox phone number is pre-configured.
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-[#635bff]" />
                    <span>Step 2: Legal Business Entity</span>
                  </h3>
                  <p className="text-[10px] text-zinc-500 uppercase">Tell us about your sole proprietor details or company registration.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Legal Business Name</label>
                  <input 
                    type="text" 
                    required
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="w-full bg-black border border-zinc-800 focus:border-[#635bff] px-3 py-2.5 outline-none text-white transition-colors uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Date of Birth</label>
                  <input 
                    type="date" 
                    required
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full bg-black border border-zinc-800 focus:border-[#635bff] px-3 py-2.5 outline-none text-white transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Category / Product Description</label>
                  <input 
                    type="text" 
                    readOnly
                    value="Digital Streaming Creator Tips (SPARKZ.TV)"
                    className="w-full bg-zinc-950 border border-zinc-900 px-3 py-2.5 outline-none text-zinc-500"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[#635bff]" />
                    <span>Step 3: Direct-Deposit Ledger Destination</span>
                  </h3>
                  <p className="text-[10px] text-zinc-500 uppercase">Bank Account where monthly settlements will be credited.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Routing Number (9 Digits)</label>
                  <input 
                    type="text" 
                    required
                    maxLength={9}
                    value={routingNumber}
                    onChange={(e) => setRoutingNumber(e.target.value.replace(/[^0-9]/gi, ""))}
                    placeholder="111000025"
                    className="w-full bg-black border border-zinc-800 focus:border-[#635bff] px-3 py-2.5 outline-none text-white transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Account Number</label>
                  <input 
                    type="text" 
                    required
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/gi, ""))}
                    placeholder="1234567890"
                    className="w-full bg-black border border-zinc-800 focus:border-[#635bff] px-3 py-2.5 outline-none text-white transition-colors"
                  />
                </div>

                <div className="border border-dashed border-zinc-800 bg-zinc-950 p-3 text-[10px] font-mono text-zinc-500 space-y-1 uppercase leading-snug">
                  <div className="font-bold text-[#635bff]">💡 TESTBED DIRECTIVES:</div>
                  <div>You can use the default sandbox bank parameters or supply custom ones. Chase routing is selected by default.</div>
                </div>
              </div>
            )}

            {/* Nav controls */}
            <div className="flex gap-2 pt-4 border-t border-zinc-900 justify-between">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="px-4 py-2 border border-zinc-800 bg-black text-zinc-400 font-bold uppercase tracking-widest hover:border-zinc-700 transition-all"
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/payouts")}
                  className="px-4 py-2 border border-zinc-800 bg-black text-zinc-500 font-bold uppercase tracking-widest hover:border-zinc-700 transition-all"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                className="px-5 py-2 bg-[#635bff] hover:bg-[#5249db] text-white font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(99,91,255,0.15)] hover:shadow-[0_0_25px_rgba(99,91,255,0.3)]"
              >
                <span>{step === 3 ? "LINK BANK ACCOUNT" : "CONTINUE"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-900 bg-black/40 px-4 py-4 text-center text-[9px] text-zinc-600 uppercase tracking-wider flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>© 2026 SPARKZ.TV // SECURE MERCHANT DEMO</span>
        <span className="flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          <span>POWERED BY STRIPE CONNECT SANDBOX ROUTING</span>
        </span>
      </div>
    </div>
  );
}
