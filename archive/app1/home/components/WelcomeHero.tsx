"use client";
import { CloudLightning } from "lucide-react";

export default function WelcomeHero({ userDisplayName }: { userDisplayName: string }) {
  return (
    <div className="bg-white border border-gray-200 p-6 shadow-xs relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 text-primary pointer-events-none">
        <CloudLightning size={100} />
      </div>
      <div className="max-w-4xl">
        <h2 className="text-sm font-black text-primary uppercase tracking-wider">
          Welcome back, {userDisplayName}.
        </h2>
        <p className="text-xs text-gray-600 mt-2 leading-relaxed">
          Upload an Aging report and at least one bank account statement
          below, then start analysis. The AI will automatically identify
          customers, match invoices and flag anything that needs your
          attention.
        </p>
      </div>
    </div>
  );
}
