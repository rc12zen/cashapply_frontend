/**
 * FAQ — /app/faq/page.tsx
 * =========================
 * Static content page per the CashApply_FAQ_Page.html reference. No client
 * state needed — <details>/<summary> handles the expand/collapse natively.
 */

interface FaqItem {
  q: string;
  a: string;
}
interface FaqSection {
  emoji: string;
  title: string;
  items: FaqItem[];
}

const SECTIONS: FaqSection[] = [
  {
    emoji: "📘",
    title: "Getting Started",
    items: [
      {
        q: "What is CashApply?",
        a: "CashApply matches your bank statements against the aging report and helps you post approved transactions to Oracle Fusion — from upload to posting, in one place.",
      },
      {
        q: "How do I log in?",
        a: "Log in with your company email via SSO. If you don't see the option to log in, your access hasn't been granted yet — contact your Administrator to be onboarded.",
      },
      {
        q: "I just logged in for the first time — why can't I do anything?",
        a: "New users are assigned the Viewer role by default, which has no working access. Ask your Administrator to assign you the right role (Analyst, Oracle Approve, or Auditor) based on what you'll be doing.",
      },
    ],
  },
  {
    emoji: "📤",
    title: "Uploading & Analysis",
    items: [
      {
        q: "How do I upload a bank statement or aging report?",
        a: "On the Home page, use the Bank Statement widget or the Aging Report widget and select Upload. The aging report also auto-loads from SFTP, so manual upload there is optional.",
      },
      {
        q: "What file formats are supported?",
        a: "PDF, Excel, and scanned/image statements are all supported. If a format isn't recognized, you'll be prompted to configure it — see \"What if my bank's format isn't recognized?\" below.",
      },
      {
        q: "What happens after I upload a statement?",
        a: "The statement is checked for duplicates, then matched line by line against the aging report. Matched items are marked automatically; anything uncertain is flagged for your review instead of guessed at.",
      },
      {
        q: "What if my bank's format isn't recognized?",
        a: "Use the Config screen to map the statement's columns to the system fields yourself — no developer help needed. Once configured, that format is remembered for future uploads.",
      },
      {
        q: "Why does it say this statement was already analyzed?",
        a: "CashApply checks every upload against previously processed statements, even if the file name has changed, to prevent the same data being analyzed twice.",
      },
    ],
  },
  {
    emoji: "✅",
    title: "Understanding Results & Exceptions",
    items: [
      {
        q: "What does \"flagged for review\" mean?",
        a: "It means the system found a transaction it isn't fully confident about — for example, a mismatched amount or an unclear invoice reference — and needs a human decision instead of guessing.",
      },
      {
        q: "How do I approve or reject a transaction?",
        a: "Open the transaction from the Analysis History or the exception queue, review the details, and select Approve or Reject. Your decision is recorded against that transaction.",
      },
      {
        q: "Can I approve everything at once?",
        a: "Reject All is available for bulk cases. Approve All is intentionally not offered — every approved posting should be reviewed individually to avoid approving something by mistake.",
      },
      {
        q: "Why was a receipt created even though the transaction isn't matched yet?",
        a: "A receipt is created in Oracle Fusion for every credit transaction as soon as it comes in, whether or not remittance details are available yet. This ensures no credit transaction is ever lost track of, even before it's matched.",
      },
    ],
  },
  {
    emoji: "👤",
    title: "Roles & Access",
    items: [
      {
        q: "What are the different user roles?",
        a: "Administrator, Analyst, Viewer, Oracle Approve, and Auditor — see the full breakdown of what each can do on the Users page, under Role Legend.",
      },
      {
        q: "Who can approve postings to Oracle?",
        a: "Only users with the Oracle Approve role. Administrators can also assign this role to others as needed.",
      },
      {
        q: "Can one person have more than one role?",
        a: "Yes. For example, a person can hold both Analyst and Oracle Approve access if that fits how your team is set up.",
      },
    ],
  },
  {
    emoji: "📈",
    title: "Reports & Usage",
    items: [
      {
        q: "Where do I see the overall reconciliation summary?",
        a: "Go to the Overview tab on the left nav for matched/unmatched/pending remittance/posted amounts and the reconciliation breakdown.",
      },
      {
        q: "Where do I see AI or token usage?",
        a: "Go to the AI Usage tab on the left nav to see token consumption, cost, and model details, filterable by user and time period.",
      },
      {
        q: "How do I view past analyses?",
        a: "Go to Analysis History for a full list of past runs, filterable by bank, business unit, user, and date, with links to the original source files.",
      },
      {
        q: "Is there an audit trail?",
        a: "Yes. Every action — uploads, approvals, rejections, config changes — is recorded in the Activity Log with the user and timestamp, for compliance and review purposes.",
      },
    ],
  },
  {
    emoji: "🔒",
    title: "Security & Support",
    items: [
      {
        q: "Where is my data stored?",
        a: "Statements and application data are hosted on-prem, within the existing enterprise firewall. Only two external services are used: Microsoft Graph API (for email-based remittance) and the Anthropic Claude API (for AI-assisted extraction).",
      },
      {
        q: "Who do I contact if something isn't working?",
        a: "Reach out to your Administrator first. If it's a product issue rather than an access issue, they'll route it to the CashApply support contact.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#222222] tracking-wide">FAQ</h1>
        <p className="text-sm text-[#6B7688] mt-1">Answers to common questions about using CashApply</p>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.title} className="bg-white border border-[#E3E7ED] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E3E7ED] flex items-center gap-2.5">
            <span className="text-sm font-bold tracking-wide text-[#222222] uppercase">
              {section.emoji} {section.title}
            </span>
          </div>
          <div className="px-5">
            {section.items.map((item, i) => (
              <details
                key={item.q}
                open={section === SECTIONS[0] && i === 0}
                className={`group py-3.5 ${i < section.items.length - 1 ? "border-b border-[#F0F2F6]" : ""}`}
              >
                <summary className="text-sm font-semibold text-[#222222] cursor-pointer list-none flex items-center justify-between">
                  {item.q}
                  <span className="text-lg font-normal text-[#8A93A6] ml-3 group-open:hidden">+</span>
                  <span className="text-lg font-normal text-[#8A93A6] ml-3 hidden group-open:inline">−</span>
                </summary>
                <p className="text-[13px] text-[#6B7688] leading-relaxed mt-2.5 mb-0.5">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-[#F0F4FB] border border-[#D8E3F5] rounded-lg px-5 py-4 flex items-center justify-between text-sm text-[#1B2B4B]">
        <span>Still have a question that isn't covered here?</span>
        <b className="text-[#222222]">Contact your Administrator →</b>
      </div>
    </div>
  );
}
