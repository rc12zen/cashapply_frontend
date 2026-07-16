"use client";
import { Sparkles } from "lucide-react";

export default function WelcomeHero({ userDisplayName }: { userDisplayName: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-7 shadow-sm relative overflow-hidden">
      {/* Soft decorative gradient blob instead of the old flat cloud icon —
          fills the empty right-hand space with something that feels designed
          rather than incidental. */}
      <div
        className="absolute -top-10 -right-10 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(34,34,34,0.06) 0%, rgba(34,34,34,0) 70%)" }}
      />
      <div className="max-w-4xl relative">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl bg-[#222222] flex items-center justify-center shrink-0">
            <Sparkles size={15} className="text-white" />
          </div>
          <h2 className="text-base font-black text-[#222222] tracking-tight">
            Welcome back, {userDisplayName}.
          </h2>
        </div>
        <p className="text-[13px] text-gray-500 leading-relaxed">
          Upload an Aging report and at least one bank account statement
          below, then start analysis. The AI will automatically identify
          customers, match invoices and flag anything that needs your
          attention.
        </p>
      </div>
    </div>
  );
}
