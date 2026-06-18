// LitSecure SVG Logo Mark — Shield with Lightning Bolt
// Uses the brand colors: Yellow (#FFD600) on dark (#05080F)

interface LitSecureLogoProps {
  size?: number;
  glow?: boolean;
  variant?: "yellow" | "dark" | "white"; // yellow=default icon, dark=on light bg, white=monochrome
  className?: string;
}

export function LitSecureIcon({ size = 32, glow = false, variant = "yellow", className = "" }: LitSecureLogoProps) {
  const outerColor = variant === "dark" ? "#05080F" : "#FFD600";
  const innerColor = variant === "dark" ? "#FFD600" : "#05080F";
  const boltColor  = variant === "white" ? "#ffffff" : variant === "dark" ? "#FFD600" : "#FFD600";
  const innerBg    = variant === "white" ? "#ffffff" : variant === "dark" ? "#FFD600" : "#05080F";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="LitSecure logo"
    >
      {glow && (
        <defs>
          <filter id="ls-glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      {/* Shield outer */}
      <path
        d="M6 6 L28 2 L50 6 L50 28 Q50 44 28 54 Q6 44 6 28 Z"
        fill={outerColor}
        filter={glow ? "url(#ls-glow)" : undefined}
      />
      {/* Shield inner cutout */}
      <path
        d="M10 9 L28 5.5 L46 9 L46 28 Q46 41 28 50 Q10 41 10 28 Z"
        fill={innerBg}
      />
      {/* Lightning bolt */}
      <path
        d="M24 16 L20 30 L27 30 L23 43 L35 26 L28 26 L33 16 Z"
        fill={boltColor}
        filter={glow ? "url(#ls-glow)" : undefined}
      />
    </svg>
  );
}

interface LitSecureWordmarkProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "dark" | "light";
  showSubtitle?: boolean;
  className?: string;
}

export function LitSecureWordmark({ size = "md", variant = "dark", showSubtitle = true, className = "" }: LitSecureWordmarkProps) {
  const sizes = {
    sm:  { icon: 24, title: "text-base",  sub: "text-[8px]",  gap: "gap-2" },
    md:  { icon: 32, title: "text-xl",    sub: "text-[9px]",  gap: "gap-2.5" },
    lg:  { icon: 44, title: "text-3xl",   sub: "text-[10px]", gap: "gap-3" },
    xl:  { icon: 72, title: "text-5xl",   sub: "text-[11px]", gap: "gap-4" },
  };
  const s = sizes[size];
  const textColor = variant === "light" ? "text-[#05080F]" : "text-white";
  const subColor  = variant === "light" ? "text-[#05080F]/60" : "text-[#FFD600]";

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      <LitSecureIcon size={s.icon} />
      <div>
        <div className={`font-bebas tracking-widest leading-none ${s.title} ${textColor}`}>
          LITSECURE
        </div>
        {showSubtitle && (
          <div className={`font-mono font-bold uppercase tracking-[0.2em] ${s.sub} ${subColor} leading-none mt-0.5`}>
            SENTINEL PLATFORM
          </div>
        )}
      </div>
    </div>
  );
}

// Stacked variant (for login/splash screens)
export function LitSecureStacked({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <LitSecureIcon size={80} glow />
      <div className="text-center">
        <div className="font-bebas text-4xl tracking-[0.2em] text-white leading-none">
          LITSECURE
        </div>
        <div className="font-mono text-[9px] text-[#FFD600] tracking-[0.3em] uppercase mt-1">
          NATIONAL CYBER INTELLIGENCE
        </div>
      </div>
    </div>
  );
}
