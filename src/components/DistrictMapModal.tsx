import React, { useState } from "react";
import {
  X, MapPin, Navigation, ExternalLink, Shield, AlertTriangle,
  Activity, Users, Globe, Map, Crosshair, ChevronRight
} from "lucide-react";

// ─── GPS centroids for all 28 Malawi districts ─────────────────────────────
export const DISTRICT_COORDS: Record<string, { lat: number; lng: number; capital?: string }> = {
  chitipa:    { lat: -9.7033,  lng: 33.2700, capital: "Chitipa Boma" },
  karonga:    { lat: -9.9333,  lng: 33.9333, capital: "Karonga" },
  likoma:     { lat: -12.0555, lng: 34.7403, capital: "Likoma Island" },
  rumphi:     { lat: -10.7869, lng: 33.8587, capital: "Rumphi" },
  mzimba:     { lat: -11.9005, lng: 33.6014, capital: "Mzuzu" },
  nkhatabay:  { lat: -11.6000, lng: 34.3000, capital: "Nkhata Bay" },
  kasungu:    { lat: -13.0167, lng: 33.4667, capital: "Kasungu" },
  nkhotakota: { lat: -12.9257, lng: 34.2950, capital: "Nkhotakota" },
  ntchisi:    { lat: -13.3833, lng: 33.8333, capital: "Ntchisi" },
  dowa:       { lat: -13.6527, lng: 33.9396, capital: "Dowa" },
  salima:     { lat: -13.7800, lng: 34.4500, capital: "Salima" },
  lilongwe:   { lat: -13.9626, lng: 33.7741, capital: "Lilongwe" },
  mchinji:    { lat: -13.8000, lng: 32.8833, capital: "Mchinji" },
  dedza:      { lat: -14.3667, lng: 34.3333, capital: "Dedza" },
  ntcheu:     { lat: -14.8167, lng: 34.6333, capital: "Ntcheu" },
  mangochi:   { lat: -14.4667, lng: 35.2667, capital: "Mangochi" },
  machinga:   { lat: -15.0000, lng: 35.5167, capital: "Machinga" },
  balaka:     { lat: -14.9833, lng: 34.9500, capital: "Balaka" },
  zomba:      { lat: -15.3833, lng: 35.3167, capital: "Zomba" },
  chiradzulu: { lat: -15.6764, lng: 35.1490, capital: "Chiradzulu" },
  blantyre:   { lat: -15.7861, lng: 35.0058, capital: "Blantyre" },
  mwanza:     { lat: -15.6078, lng: 34.5185, capital: "Mwanza" },
  thyolo:     { lat: -16.0674, lng: 35.1489, capital: "Thyolo" },
  mulanje:    { lat: -15.9281, lng: 35.5021, capital: "Mulanje" },
  phalombe:   { lat: -15.8048, lng: 35.6520, capital: "Phalombe" },
  chikwawa:   { lat: -16.0273, lng: 34.7910, capital: "Chikwawa" },
  nsanje:     { lat: -16.9171, lng: 35.2648, capital: "Nsanje" },
  neno:       { lat: -15.3973, lng: 34.6477, capital: "Neno" },
};

export interface DistrictModalData {
  id: string;
  name: string;
  region: string;
  riskScore: number;
  activeIncidents: number;
  primaryThreat: string;
  population?: string;
}

interface Props {
  district: DistrictModalData;
  onClose: () => void;
}

const RISK_STYLE = (score: number) => {
  if (score >= 80) return { label: "CRITICAL", cls: "text-red-400 bg-red-500/15 border-red-500/30" };
  if (score >= 60) return { label: "HIGH",     cls: "text-orange-400 bg-orange-500/15 border-orange-500/30" };
  if (score >= 40) return { label: "ELEVATED", cls: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30" };
  if (score >= 20) return { label: "FAIR",     cls: "text-blue-400 bg-blue-500/15 border-blue-500/30" };
  return              { label: "GOOD",     cls: "text-green-400 bg-green-500/15 border-green-500/30" };
};

export default function DistrictMapModal({ district, onClose }: Props) {
  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");
  const coords = DISTRICT_COORDS[district.id];

  const risk = RISK_STYLE(district.riskScore);

  // OSM embed URL — free, no API key required
  const osmEmbedUrl = coords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.8},${coords.lat - 0.6},${coords.lng + 0.8},${coords.lat + 0.6}&layer=mapnik&marker=${coords.lat},${coords.lng}`
    : null;

  const googleMapsUrl = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=11`
    : `https://www.google.com/maps?q=${district.name}+District+Malawi`;

  const osmDirectUrl = coords
    ? `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=11/${coords.lat}/${coords.lng}`
    : `https://www.openstreetmap.org/search?q=${district.name}+Malawi`;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(5,8,15,0.92)", backdropFilter: "blur(12px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "#0A0E1A", boxShadow: "0 25px 80px rgba(0,0,0,0.7)" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-[#FFD600]" />
            </div>
            <div>
              <div className="font-grotesk font-bold text-white text-sm">{district.name} District</div>
              <div className="text-[10px] text-slate-500 font-mono">{district.region} Region · Malawi</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded border font-mono ${risk.cls}`}>
              {risk.label}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/8 text-slate-500 hover:text-slate-200 transition"
              id="district-modal-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-0">

          {/* ── Map Panel ── */}
          <div className="md:col-span-3 relative">
            {/* Map type toggle */}
            <div className="absolute top-2 left-2 z-10 flex gap-1">
              <button
                onClick={() => setMapType("standard")}
                className={`px-2 py-1 text-[9px] font-mono font-bold rounded border transition ${
                  mapType === "standard"
                    ? "bg-[#FFD600] text-[#05080F] border-[#FFD600]"
                    : "bg-[#0A0E1A]/80 text-slate-400 border-white/10 hover:border-white/20"
                }`}
              >
                MAP
              </button>
            </div>

            {osmEmbedUrl ? (
              <iframe
                src={osmEmbedUrl}
                className="w-full"
                style={{ height: "300px", border: "none" }}
                title={`${district.name} District Map`}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="w-full h-72 bg-[#05080F] flex flex-col items-center justify-center gap-3 text-slate-600">
                <Map className="w-10 h-10 opacity-30" />
                <p className="text-xs font-mono">Map coordinates unavailable</p>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-2 px-3 py-2.5 border-t border-white/8 bg-[#05080F]/60">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#4285F4]/15 border border-[#4285F4]/30 text-[#4285F4] text-[11px] font-mono font-bold hover:bg-[#4285F4]/25 transition"
                id="open-google-maps-btn"
              >
                <Navigation className="w-3.5 h-3.5" />
                Google Maps
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
              <a
                href={osmDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#7EBC6F]/15 border border-[#7EBC6F]/30 text-[#7EBC6F] text-[11px] font-mono font-bold hover:bg-[#7EBC6F]/25 transition"
                id="open-osm-btn"
              >
                <Globe className="w-3.5 h-3.5" />
                OpenStreetMap
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            </div>
          </div>

          {/* ── Intel Panel ── */}
          <div className="md:col-span-2 border-l border-white/8 flex flex-col">
            {/* GPS Coords */}
            {coords && (
              <div className="px-4 py-3 border-b border-white/8 bg-[#05080F]/40">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mb-1">
                  <Crosshair className="w-3 h-3" /> GPS COORDINATES
                </div>
                <div className="font-mono text-xs text-[#FFD600]">
                  {coords.lat.toFixed(4)}°, {coords.lng.toFixed(4)}°
                </div>
                {coords.capital && (
                  <div className="text-[10px] text-slate-500 mt-0.5">{coords.capital}</div>
                )}
              </div>
            )}

            {/* Cyber Stats */}
            <div className="px-4 py-3 border-b border-white/8 space-y-2.5">
              <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">
                Cyber Threat Status
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-[#FFD600]" /> Risk Score
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${district.riskScore}%`,
                        background: district.riskScore >= 80 ? "#ef4444" : district.riskScore >= 60 ? "#f97316" : district.riskScore >= 40 ? "#eab308" : "#3b82f6",
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold font-mono text-white">{district.riskScore}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-orange-400" /> Active Incidents
                </span>
                <span className={`text-[11px] font-bold font-mono ${district.activeIncidents > 0 ? "text-orange-400" : "text-green-400"}`}>
                  {district.activeIncidents}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-red-400" /> Primary Threat
                </span>
                <span className="text-[10px] font-mono text-red-300 max-w-[100px] text-right truncate">
                  {district.primaryThreat}
                </span>
              </div>

              {district.population && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-blue-400" /> Population
                  </span>
                  <span className="text-[11px] font-mono text-blue-300">{district.population}</span>
                </div>
              )}
            </div>

            {/* Region badge */}
            <div className="px-4 py-3 border-b border-white/8">
              <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">
                Administrative Region
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border font-mono ${
                  district.region === "Northern" ? "text-amber-400 bg-amber-500/10 border-amber-500/25" :
                  district.region === "Central"  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" :
                  "text-yellow-400 bg-yellow-500/10 border-yellow-500/25"
                }`}>
                  {district.region} Region
                </span>
              </div>
            </div>

            {/* Quick actions */}
            <div className="px-4 py-3 mt-auto">
              <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">
                Quick Actions
              </div>
              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("navigate-tab", { detail: { tab: "riskmap" } }));
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FFD600]/8 border border-[#FFD600]/20 text-[#FFD600] text-[10px] font-mono font-bold hover:bg-[#FFD600]/15 transition text-left"
                >
                  <MapPin className="w-3 h-3" />
                  View on National Risk Map
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </button>
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("navigate-tab", { detail: { tab: "command", filter: district.name } }));
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/4 border border-white/8 text-slate-400 text-[10px] font-mono hover:bg-white/8 transition text-left"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Filter incidents for {district.name}
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-2.5 border-t border-white/8 flex items-center justify-between text-[9px] font-mono text-slate-600 bg-[#05080F]/40">
          <span>LitSecure Sentinel · District Location Intelligence</span>
          <span>Map data © OpenStreetMap contributors</span>
        </div>
      </div>
    </div>
  );
}
