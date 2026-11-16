"use client";
import { useState } from "react";

export function CopyLink({ url, name, phone, event }: { url: string; name: string; phone: string | null; event: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Hello ${name.split(" ")[0]}, you're invited to ${event}! Please RSVP and keep your personal access card here: ${url}`;
  const wa = phone ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "234")}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  return (
    <div className="flex gap-1">
      <button
        className="btn-outline btn-sm"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a href={wa} target="_blank" rel="noreferrer" className="btn-sm btn bg-emerald-600 text-white hover:bg-emerald-700">WhatsApp</a>
    </div>
  );
}
