import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";

export default function Short() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState("Resolviendo enlace corto…");

  useEffect(() => {
    async function run() {
      const { data, error } = await supabase
        .from("short_links")
        .select("session_id")
        .eq("slug", slug)
        .single();

      if (error || !data?.session_id) {
        setMsg("Enlace inválido o caducado.");
        return;
      }

      nav(`/join?session=${data.session_id}`, { replace: true });
    }
    run();
  }, [slug]);

  return <div>{msg}</div>;
}
