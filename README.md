# johnnycosta.dev

Personal website and portfolio of Johnny Costa — Software Developer & Systems Consultant.

Built with [Vite](https://vitejs.dev/) and vanilla HTML/CSS/JS. Served with nginx in Docker.

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

## Docker

```bash
docker compose up --build    # serves at http://localhost:8080
```

Or manually:

```bash
docker build -t johnnycosta.dev .
docker run --rm -p 8080:80 johnnycosta.dev
```

## Notes

- Contact: contact@johnnycosta.dev. The contact form's backend isn't wired up yet —
  set `data-endpoint="<url>"` on `#contact-form` in `index.html` once the API exists.
  Until then the form falls back to opening a pre-filled email (mailto).
- Portfolio projects are sourced from [github.com/Jhowl](https://github.com/Jhowl).
