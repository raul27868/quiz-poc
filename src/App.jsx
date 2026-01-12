import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import Host from "./pages/Host.jsx";
import Join from "./pages/Join.jsx";
import Short from "./pages/Short.jsx";

export default function App() {
  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <Link to="/">Home</Link>
        <Link to="/host">Host</Link>
        <Link to="/join">Join</Link>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Join />} />
        <Route path="/s/:slug" element={<Short />} />
      </Routes>
    </div>
  );
}

function Home() {
  return (
    <div>
      <h2>Quiz PoC</h2>
      <p>PoC de infraestructura: sesión en vivo, QR/enlace corto y ranking.</p>
      <ol>
        <li>Ve a <b>Host</b> para crear test/sesión.</li>
        <li>Comparte el QR o enlace corto.</li>
        <li>Los participantes entran por <b>Join</b>.</li>
      </ol>
    </div>
  );
}
