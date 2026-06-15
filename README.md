# johnnycosta.dev

Personal website and portfolio of Johnny Costa — Software Developer & Systems Consultant.

Frontend: [Vite](https://vitejs.dev/) + vanilla HTML/CSS/JS, served by nginx.
Backend (`server/`): Node + Express API that powers the AI chat widget and lead capture,
streaming from a local **Ollama** instance and storing data in SQLite.

## Architecture

```
Browser ──▶ nginx (web) ──▶ static site
                       └──▶ /api/* ──▶ Express (api) ──▶ Ollama (LAN)
                                                    └──▶ SQLite (./data)
```

## Development

Run the frontend and backend in two terminals (Vite proxies `/api` → `localhost:3000`):

```bash
# terminal 1 — backend
cd server
cp .env.example .env   # set ADMIN_TOKEN, OLLAMA_URL, OLLAMA_MODEL
npm install
npm run dev            # http://localhost:3000

# terminal 2 — frontend
npm install
npm run dev            # http://localhost:5173
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

## Docker (full stack)

```bash
cp .env.example .env          # set a strong ADMIN_TOKEN
docker compose up --build     # site at http://localhost:8080
```

Two services: `web` (nginx, serves the site and reverse-proxies `/api`) and `api` (Express).
Chat data persists in `./data/chat.db` (mounted volume).

## AI chat widget

- Floating chat launcher on every page. Visitors talk to "Johnny's AI", backed by Ollama.
- **All conversations are logged** to SQLite.
- **Soft gate:** after `SOFT_LIMIT` (default 8) messages, the widget asks for name + email so
  Johnny can follow up — chatting still continues. Leads are saved.
- **Limits:** per-IP rate limiting + max message length guard abuse of the local GPU.
- The site contact form posts to the same backend (`/api/lead`).

### Configuration (env — see `.env.example`)

| Var | Default | Purpose |
|-----|---------|---------|
| `OLLAMA_URL` | `http://192.168.1.182:11434` | Ollama endpoint (host must reach it) |
| `OLLAMA_MODEL` | `gemma4:12b` | Model tag. If "model not found", change this and restart |
| `ADMIN_TOKEN` | — | Required to read logs/leads. Set a long random value |
| `SOFT_LIMIT` | `8` | Messages before the contact prompt |
| `MAX_MSG_LEN` | `2000` | Max characters per message |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `40` / `600000` | Per-IP rate limit |

### Reading logs & leads

Token-protected admin page at **`/api/admin/`** (enter the `ADMIN_TOKEN`), or the JSON endpoints:

```bash
curl "http://localhost:8080/api/admin/leads?token=$ADMIN_TOKEN"
curl "http://localhost:8080/api/admin/conversations?token=$ADMIN_TOKEN"
```

## Notes

- Contact: contact@johnnycosta.dev · Book a call: https://calendly.com/costa-johnny/30min
- Portfolio projects are sourced from [github.com/Jhowl](https://github.com/Jhowl).
