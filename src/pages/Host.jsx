import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../supabase";

function randHostKey() {
  return crypto.randomUUID();
}

function randSlug(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function Host() {
  const [testTitle, setTestTitle] = useState("Demo Test");
  const [questionsText, setQuestionsText] = useState(`¿2+2?
A) 3
B) 4
C) 5
D) 22
CORRECT=B
COMPETITION=true

Capital de España
A) Sevilla
B) Madrid
C) Barcelona
D) Valencia
CORRECT=B
COMPETITION=true
`);
  const [sessionId, setSessionId] = useState(null);
  const [hostKey, setHostKey] = useState(() => randHostKey());
  const [slug, setSlug] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);

  const [session, setSession] = useState(null);
  const [ranking, setRanking] = useState([]);

  const joinUrl = useMemo(() => {
    if (!slug) return null;
    return `${window.location.origin}/s/${slug}`;
  }, [slug]);

  // realtime: sesión
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`sess-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          setSession(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // realtime: ranking (participants)
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`rank-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sessionId}` },
        async () => {
          await refreshRanking(sessionId);
        }
      )
      .subscribe();

    refreshRanking(sessionId);

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  async function refreshRanking(sid) {
    const { data, error } = await supabase
      .from("participants")
      .select("nickname,total_score")
      .eq("session_id", sid)
      .order("total_score", { ascending: false })
      .limit(50);

    if (!error) setRanking(data || []);
  }

  function parseQuestionsBlock(text) {
    // Formato simple por bloques separados por línea en blanco:
    // pregunta
    // A) ...
    // B) ...
    // C) ...
    // D) ...
    // CORRECT=B
    // COMPETITION=true|false
    const blocks = text
      .split(/\n\s*\n/g)
      .map((b) => b.trim())
      .filter(Boolean);

    const qs = [];
    for (const b of blocks) {
      const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
      const statement = lines[0];
      const opt = { A: "", B: "", C: "", D: "" };
      let correct = null;
      let in_competition = true;

      for (const l of lines.slice(1)) {
        const m = l.match(/^([ABCD])\)\s*(.+)$/i);
        if (m) opt[m[1].toUpperCase()] = m[2].trim();

        const c = l.match(/^CORRECT\s*=\s*([ABCD])$/i);
        if (c) correct = c[1].toUpperCase();

        const ic = l.match(/^COMPETITION\s*=\s*(true|false)$/i);
        if (ic) in_competition = ic[1].toLowerCase() === "true";
      }

      if (!statement || !opt.A || !opt.B || !opt.C || !opt.D || !correct) {
        throw new Error("Bloque inválido: revisa formato A) B) C) D) CORRECT=");
      }

      qs.push({ statement, a: opt.A, b: opt.B, c: opt.C, d: opt.D, correct, in_competition });
    }
    return qs;
  }

  async function createTestAndSession() {
    // 1) Crear test
    const { data: testIns, error: e1 } = await supabase
      .from("tests")
      .insert({ title: testTitle })
      .select("id")
      .single();

    if (e1) return alert(e1.message);

    // 2) Insertar preguntas
    let qs;
    try {
      qs = parseQuestionsBlock(questionsText);
    } catch (err) {
      return alert(err.message);
    }

    const qRows = qs.map((q, i) => ({ ...q, test_id: testIns.id, order_index: i }));
    const { error: e2 } = await supabase.from("questions").insert(qRows);
    if (e2) return alert(e2.message);

    // 3) Crear sesión via RPC (host_key)
    const { data: sid, error: e3 } = await supabase.rpc("host_create_session", {
      p_test_id: testIns.id,
      p_host_key: hostKey,
    });
    if (e3) return alert(e3.message);

    setSessionId(sid);

    // 4) Crear short link
    const newSlug = randSlug();
    const { error: e4 } = await supabase.from("short_links").insert({ slug: newSlug, session_id: sid });
    if (e4) return alert(e4.message);
    setSlug(newSlug);

    // 5) QR
    const url = `${window.location.origin}/s/${newSlug}`;
    const dataUrl = await QRCode.toDataURL(url);
    setQrDataUrl(dataUrl);

    // cargar session inicial
    const { data: sess } = await supabase.from("sessions").select("*").eq("id", sid).single();
    setSession(sess);
  }

  async function hostOpen() {
    const { error } = await supabase.rpc("host_open_question", { p_session_id: sessionId, p_host_key: hostKey });
    if (error) alert(error.message);
  }

  async function hostClose() {
    const { error } = await supabase.rpc("host_close_question", { p_session_id: sessionId, p_host_key: hostKey });
    if (error) alert(error.message);
  }

  async function hostNext() {
    const { error } = await supabase.rpc("host_next_question", { p_session_id: sessionId, p_host_key: hostKey });
    if (error) alert(error.message);
  }

  async function hostEnd() {
    const { error } = await supabase.rpc("host_end_session", { p_session_id: sessionId, p_host_key: hostKey });
    if (error) alert(error.message);
  }

  return (
    <div>
      <h2>Host (Profesor)</h2>

      {!sessionId ? (
        <>
          <div style={{ display: "grid", gap: 8 }}>
            <label>
              Título test:
              <input value={testTitle} onChange={(e) => setTestTitle(e.target.value)} style={{ width: "100%" }} />
            </label>

            <label>
              Preguntas (bloques):
              <textarea
                value={questionsText}
                onChange={(e) => setQuestionsText(e.target.value)}
                rows={14}
                style={{ width: "100%", fontFamily: "monospace" }}
              />
            </label>

            <div>
              <div><b>Host key</b> (guárdalo, controla la sesión):</div>
              <code style={{ wordBreak: "break-all" }}>{hostKey}</code>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setHostKey(randHostKey())}>Regenerar host key</button>
              </div>
            </div>

            <button onClick={createTestAndSession}>Crear Test + Sesión</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
            <div><b>Session</b>: <code>{sessionId}</code></div>
            <div><b>Estado</b>: {session?.status} / {session?.phase}</div>
            <div><b>Pregunta index</b>: {session?.current_index}</div>
            <div style={{ marginTop: 8 }}>
              <b>Enlace corto</b>: {joinUrl ? <a href={joinUrl}>{joinUrl}</a> : "…"}
            </div>
            {qrDataUrl && (
              <div style={{ marginTop: 8 }}>
                <img src={qrDataUrl} alt="QR" style={{ width: 200, height: 200 }} />
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={hostOpen} disabled={!sessionId}>Abrir pregunta</button>
            <button onClick={hostClose} disabled={!sessionId}>Cerrar pregunta + ranking</button>
            <button onClick={hostNext} disabled={!sessionId}>Siguiente</button>
            <button onClick={hostEnd} disabled={!sessionId}>Finalizar sesión</button>
          </div>

          <h3 style={{ marginTop: 16 }}>Ranking</h3>
          <ol>
            {ranking.map((r, i) => (
              <li key={i}>
                {r.nickname} — <b>{r.total_score}</b>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
