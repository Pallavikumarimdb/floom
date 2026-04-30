/**
 * ThreeSurfacesDiagram — adapted from floom-byo-orchestrator's
 * ThreeSurfacesDiagram.tsx for Next.js + Tailwind v4.
 * Inline SVG, no animation, scales on mobile.
 */
export function ThreeSurfacesDiagram() {
  return (
    <section
      data-testid="three-surfaces-diagram"
      className="mx-auto max-w-5xl px-5 py-2 text-center"
    >
      <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-emerald-700">
        One app, three surfaces
      </p>
      <h2 className="mx-auto max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
        One app gets a web page, MCP endpoint, and JSON API.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-neutral-600">
        Same logic, three places it shows up. Run the live apps now or join the
        waitlist for hosted publishing.
      </p>

      <div className="mx-auto mt-10 max-w-3xl">
        <svg
          viewBox="0 0 820 260"
          width="100%"
          role="img"
          aria-labelledby="three-surfaces-title three-surfaces-desc"
          style={{ display: "block", height: "auto" }}
        >
          <title id="three-surfaces-title">
            Paste your app to get three surfaces
          </title>
          <desc id="three-surfaces-desc">
            A diagram with one source box labelled &ldquo;Your app&rdquo; on the
            left, connected by three lines to three target boxes on the right: a
            web page, an MCP endpoint, and a JSON API.
          </desc>

          <defs>
            <marker
              id="three-surfaces-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="#047857" />
            </marker>
          </defs>

          {/* Source box */}
          <g>
            <rect
              x="20"
              y="100"
              width="220"
              height="60"
              rx="10"
              ry="10"
              fill="#ffffff"
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text
              x="130"
              y="126"
              textAnchor="middle"
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
              fontSize="10"
              fontWeight="600"
              fill="#6b7280"
              letterSpacing="1.2"
            >
              YOUR APP
            </text>
            <text
              x="130"
              y="146"
              textAnchor="middle"
              fontFamily="'Inter', system-ui, sans-serif"
              fontSize="14"
              fontWeight="600"
              fill="#0e0e0c"
            >
              One JSON spec on GitHub
            </text>
          </g>

          {/* Connector lines */}
          <g
            stroke="#047857"
            strokeWidth="1.5"
            fill="none"
            markerEnd="url(#three-surfaces-arrow)"
          >
            <path d="M240,130 C340,130 420,50 550,50" />
            <path d="M240,130 C340,130 420,130 550,130" />
            <path d="M240,130 C340,130 420,210 550,210" />
          </g>

          {/* Surface: Web page */}
          <SurfaceRect
            y={20}
            label="WEB PAGE"
            title="/p/your-app"
            hint="Shareable URL. No signup."
          />
          {/* Surface: MCP endpoint */}
          <SurfaceRect
            y={100}
            label="MCP ENDPOINT"
            title="Claude / Cursor / ChatGPT"
            hint="Your app as a tool in the chat."
          />
          {/* Surface: JSON API */}
          <SurfaceRect
            y={180}
            label="JSON API"
            title="POST /api/runs"
            hint="Bearer token. JSON in, JSON out."
          />
        </svg>
      </div>
    </section>
  );
}

interface SurfaceRectProps {
  y: number;
  label: string;
  title: string;
  hint: string;
}

function SurfaceRect({ y, label, title, hint }: SurfaceRectProps) {
  return (
    <g>
      <rect
        x="550"
        y={y}
        width="250"
        height="60"
        rx="10"
        ry="10"
        fill="#ffffff"
        stroke="#e5e7eb"
        strokeWidth="1"
      />
      <text
        x="566"
        y={y + 20}
        fontFamily="'JetBrains Mono', ui-monospace, monospace"
        fontSize="9.5"
        fontWeight="600"
        fill="#047857"
        letterSpacing="1.2"
      >
        {label}
      </text>
      <text
        x="566"
        y={y + 36}
        fontFamily="'Inter', system-ui, sans-serif"
        fontSize="13"
        fontWeight="600"
        fill="#0e0e0c"
      >
        {title}
      </text>
      <text
        x="566"
        y={y + 51}
        fontFamily="'Inter', system-ui, sans-serif"
        fontSize="11.5"
        fill="#6b7280"
      >
        {hint}
      </text>
    </g>
  );
}
