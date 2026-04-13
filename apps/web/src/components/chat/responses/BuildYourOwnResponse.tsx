import { useState } from 'react';

export function BuildYourOwnResponse() {
  const [url, setUrl] = useState('');

  return (
    <div className="assistant-turn">
      <div className="app-expanded-card">
        <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.6 }}>
          Floom takes any OpenAPI spec and generates an MCP server, a CLI, an HTTP endpoint, and a chat UI automatically — plus secrets, rate limits, and all the production plumbing. Paste a spec URL below.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.stripe.com/api/openapi.json"
            style={{
              flex: 1,
              height: 40,
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              padding: '0 12px',
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--ink)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            style={{
              height: 40,
              padding: '0 16px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onClick={() => {
              if (url.trim()) {
                // Stub: future integration point
                window.open(url.trim(), '_blank');
              }
            }}
          >
            Deploy
          </button>
        </div>
      </div>
    </div>
  );
}
