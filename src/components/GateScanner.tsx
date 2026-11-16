"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type G = { h: string; id: string; name: string; category: string; table: string | null; rsvp: string; revoked: boolean; checkedInAt: string | null };
type Manifest = { event: { id: string; title: string; hostNames: string }; syncedAt: string; guests: G[] };
type Result = { kind: "ok" | "dup" | "bad" | "revoked"; title: string; detail?: string };

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Offline-first gate scanner. Downloads the manifest (hashed tokens) once, scans with the camera
 * (BarcodeDetector, Chrome on Android) or a USB/Bluetooth scanner typing into the box, records
 * check-ins locally, and syncs to the server whenever there is a connection.
 */
export function GateScanner({ eventId }: { eventId: string }) {
  const key = `eventa-gate-${eventId}`;
  const [m, setM] = useState<Manifest | null>(null);
  const [queue, setQueue] = useState<{ id: string; at: string }[]>([]);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [online, setOnline] = useState(true);
  const [camera, setCamera] = useState(false);
  const [code, setCode] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);

  // Load cached state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const s = JSON.parse(raw);
        setM(s.m);
        setQueue(s.queue ?? []);
        setLocal(s.local ?? {});
      }
    } catch {}
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [key]);

  useEffect(() => {
    try {
      if (m) localStorage.setItem(key, JSON.stringify({ m, queue, local }));
    } catch {}
  }, [key, m, queue, local]);

  const download = useCallback(async () => {
    const r = await fetch(`/api/gate/${eventId}/manifest`, { cache: "no-store" });
    if (!r.ok) throw new Error("Could not download guest list");
    setM(await r.json());
  }, [eventId]);

  const sync = useCallback(async () => {
    if (!queue.length || !navigator.onLine) return;
    const batch = queue;
    const r = await fetch(`/api/gate/${eventId}/checkin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkins: batch }) });
    if (r.ok) {
      setQueue((q) => q.filter((x) => !batch.some((b) => b.id === x.id)));
      await download();
    }
  }, [queue, eventId, download]);

  useEffect(() => {
    if (!m && navigator.onLine) download().catch(() => {});
  }, [m, download]);

  useEffect(() => {
    const t = setInterval(() => sync().catch(() => {}), 10_000);
    return () => clearInterval(t);
  }, [sync]);

  const handle = useCallback(
    async (raw: string) => {
      if (!m || busy.current) return;
      busy.current = true;
      try {
        const token = raw.trim().replace(/^EVTA:/, "");
        const h = await sha256(token);
        const g = m.guests.find((x) => x.h === h);
        let res: Result;
        if (!g) res = { kind: "bad", title: "Not on the guest list", detail: "Invalid or old QR code. Send to the host desk." };
        else if (g.revoked) res = { kind: "revoked", title: `${g.name}: card revoked`, detail: "A newer card was issued or access was withdrawn." };
        else if (g.checkedInAt || local[g.id])
          res = { kind: "dup", title: `${g.name} is already in`, detail: `Checked in at ${new Date(g.checkedInAt ?? local[g.id]).toLocaleTimeString()}` };
        else {
          const at = new Date().toISOString();
          setLocal((l) => ({ ...l, [g.id]: at }));
          setQueue((q) => [...q, { id: g.id, at }]);
          res = { kind: "ok", title: `Welcome, ${g.name}`, detail: `${g.category === "GENERAL" ? "Guest" : g.category} · ${g.table ? "Table: " + g.table : "No table assigned"}` };
        }
        setResult(res);
        if ("vibrate" in navigator) navigator.vibrate(res.kind === "ok" ? 80 : [60, 40, 60]);
      } finally {
        setTimeout(() => (busy.current = false), 1200);
      }
    },
    [m, local],
  );

  // Camera scanning via BarcodeDetector when available
  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      if (!("BarcodeDetector" in window)) {
        setResult({ kind: "bad", title: "Camera scanning not supported in this browser", detail: "Use Chrome on Android, or a USB/Bluetooth scanner." });
        setCamera(false);
        return;
      }
      // BarcodeDetector is not in the TypeScript DOM lib yet
      const detector = new (window as unknown as { BarcodeDetector: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({ formats: ["qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const tick = async () => {
        if (stopped || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) await handle(codes[0].rawValue);
        } catch {}
        raf = requestAnimationFrame(tick);
      };
      tick();
    })().catch(() => setCamera(false));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera, handle]);

  const total = m?.guests.filter((g) => !g.revoked && g.rsvp !== "NO").length ?? 0;
  const inside = m ? m.guests.filter((g) => g.checkedInAt || local[g.id]).length : 0;
  const color = { ok: "bg-emerald-600", dup: "bg-amber-500", bad: "bg-red-600", revoked: "bg-red-600" };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className={`badge ${online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{online ? "Online" : "Offline: scans saved on this phone"}</span>
        <span>{queue.length ? `${queue.length} waiting to sync` : "All synced"}</span>
      </div>
      {!m ? (
        <button className="btn-primary w-full" onClick={() => download().catch((e) => alert(e.message))}>Download guest list</button>
      ) : (
        <>
          <div className="card text-center">
            <div className="text-sm text-stone-500">{m.event.title}</div>
            <div className="text-4xl font-extrabold">{inside}<span className="text-xl text-stone-400"> / {total}</span></div>
            <div className="text-xs text-stone-500">checked in · list updated {new Date(m.syncedAt).toLocaleTimeString()}</div>
          </div>
          {result && (
            <div className={`rounded-xl p-6 text-center text-white ${color[result.kind]}`}>
              <div className="text-2xl font-bold">{result.kind === "ok" ? "✓ " : result.kind === "dup" ? "⚠ " : "✕ "}{result.title}</div>
              {result.detail && <div className="mt-1 text-lg">{result.detail}</div>}
            </div>
          )}
          {camera && <video ref={videoRef} className="w-full rounded-xl bg-black" muted playsInline />}
          <div className="flex gap-2">
            <button className={camera ? "btn-outline flex-1" : "btn-gold flex-1"} onClick={() => setCamera((c) => !c)}>{camera ? "Stop camera" : "📷 Scan with camera"}</button>
            <button className="btn-outline" onClick={() => { sync().catch(() => {}); download().catch(() => {}); }}>↻ Sync</button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handle(code);
              setCode("");
            }}
            className="flex gap-2"
          >
            <input autoFocus className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scanner input or paste code" />
            <button className="btn-primary">Check</button>
          </form>
        </>
      )}
    </div>
  );
}
