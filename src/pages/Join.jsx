import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

function useQuery() {
  return new URLSearchParams(window.location.search);
}

export default function Join() {
  const q = useQuery();
  const sessionId = q.get("session") || "";
  const [sid, setSid] = useState(sessionId);

  const [nickname, setNickname] = useState("");
  const [participantId, setParticipantId] = useState(null);

  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);

  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(false);

  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    setSid(sessionId);
  }, [sessionId]);

  // cargar sesión y escuchar cambios
  useEffect(() => {
    if (!sid) return;

    let active = true;

    async function load() {
      const { data, error } = await supabase.from("sessions").select("*").eq("id", sid).single();
      if (!error && active) setSession(data);
    }
    load();

    const ch = supabase
      .channel(`sess-${sid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sid}` }, (p) => {
        setSession(p.new);
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [sid]);

  // cargar pregunta actual cuando cambie current_index
  useEffect(() => {
    if (!session) return;

    async function loadQuestion() {
      // obtener la pregunta por (test_id + offset current_index)
      const { data: qs, error } = await supabase
        .from("questions")
        .select("*")
        .eq("test_id", session.test_id)
        .order("order_index", { ascending: true });

      if (error) return;

      const q = qs[session.current_index] || null;
      setQuestion(q);
      setSelected(null);
      setLocked(false);
    }

    loadQuestion();
  }, [session?.test_id, session?.current_index]);

  // ranking: refrescar cuando estamos mostrando ranking o ended
  useEffect(() => {
    if (!sid) return;

    const ch = supabase
      .channel(`rank-${sid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sid}` }, () => {
        refreshRanking();
      })
      .subscribe();

    refreshRanking();

    return () => supabase.removeChannel(ch);
  }, [sid]);

  async function refreshRanking() {
    const { data } = await supabase
      .from("participants")
      .select("nickname,total_score")
      .eq("session_id", sid)
      .order("total_score", { ascending: false })
      .limit(50);

    setRanking(data || []);
  }

  const canAnswer = useMemo(() => {
    return session?.phase === "open" && session?.status !== "ended" && !!question && !!participantId && !locked;
  }, [session, question, participantId, locked]);

  async function joinSession() {
    if (!sid) return alert("Pon session id (o entra por enlace corto/QR)");
    if (!nickname.trim()) return alert("Pon un nick");

    const { data, error } = await supabase
      .from("participants")
      .insert({ session_id: sid, nickname: nickname.trim() })
      .select("id")
      .single();

    if (error) return alert(error.message);
    setParticipantId(data.id);
  }

  async function submitAnswer(opt) {
    if (!canAnswer) return;

    setSelected(opt);
    setLocked(true);

    const { error } = await supabase.from("answers").insert({
      session_id: sid,
      question_id: question.id,
      participant_id: participantId,
      selected: opt,
    });

    // Si intenta enviar dos veces, saltará unique constraint.
    if (error) {
      alert(error.message);
      return;
    }
  }

  return (
    <div>
      <h2>Join (Participante)</h2>

      {!sid && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div>Entra por QR/enlace corto, o pega Session ID:</div>
          <input value={sid} onChange={(e) => setSid(e.target.value)} style={{ width: "100%" }} />
        </div>
      )}

      {!participantId ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div><b>Session</b>: <code>{sid || "—"}</code></div>
          <label>
            Nick:
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} style={{ width: "100%" }} />
          </label>
          <button onClick={joinSession} style={{ marginTop: 8 }}>Entrar</button>
        </div>
      ) : (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div>✅ Conectado como <b>{nickname}</b></div>
          <div>Estado: <b>{session?.status}</b> / <b>{session?.phase}</b></div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {session?.status === "ended" ? (
          <>
            <h3>Ranking final</h3>
            <ol>
              {ranking.map((r, i) => (
                <li key={i}>{r.nickname} — <b>{r.total_score}</b></li>
              ))}
            </ol>
          </>
        ) : session?.phase === "showing_ranking" ? (
          <>
            <h3>Ranking</h3>
            <ol>
              {ranking.map((r, i) => (
                <li key={i}>{r.nickname} — <b>{r.total_score}</b></li>
              ))}
            </ol>
            <div style={{ marginTop: 8, color: "#555" }}>Esperando siguiente pregunta…</div>
          </>
        ) : session?.phase === "open" ? (
          <>
            <h3>Pregunta</h3>
            {!question ? (
              <div>No hay pregunta (¿se acabó el test?).</div>
            ) : (
              <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
                <div style={{ fontSize: 18, marginBottom: 10 }}>{question.statement}</div>

                <div style={{ display: "grid", gap: 8 }}>
                  {["A","B","C","D"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => submitAnswer(opt)}
                      disabled={!canAnswer}
                      style={{
                        padding: 10,
                        textAlign: "left",
                        opacity: selected && selected !== opt ? 0.6 : 1
                      }}
                    >
                      <b>{opt})</b> {question[opt.toLowerCase()]}
                    </button>
                  ))}
                </div>

                {locked && <div style={{ marginTop: 8 }}>✅ Respuesta enviada (no se puede cambiar).</div>}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#555" }}>Esperando a que el profesor abra la pregunta…</div>
        )}
      </div>
    </div>
  );
}
