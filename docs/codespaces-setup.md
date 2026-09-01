# GitHub Codespaces setup

IlmSaathi includes a repository-owned Codespaces environment. It runs Node.js 22 in the workspace container and MongoDB 8 as a private companion container configured as the required single-node `rs0` replica set. MongoDB is not forwarded outside the codespace.

## First creation

1. Push this repository, including `.devcontainer`, to GitHub.
2. On the repository page, choose **Code → Codespaces → Create codespace on the branch you want**.
3. Wait for the post-create task to generate a private `.env`, install the exact lockfile dependencies, and run TypeScript checks.
4. In the Codespaces terminal, run:

```bash
npm run dev:codespaces
```

The command waits for the MongoDB replica set, seeds the subject catalogue idempotently, and starts the API and Vite web app. Port 5173 is labeled **IlmSaathi Web** and opens through a private forwarded HTTPS URL. Port 4000 is labeled **IlmSaathi API** and remains private too.

Do not run `npm run dev:native` in Codespaces. That command is only for a computer with MongoDB Community Server installed directly on it.

## Verify the real workflow

Keep the development command running. Open a second terminal and run:

```bash
npm run doctor
npm run smoke:local
```

The smoke check exercises API health, CSRF, registration, MongoDB, onboarding, educator draft saving, and transactional submission. It deletes only its uniquely named temporary account when finished.

## Daily use

After a stopped codespace resumes, run:

```bash
npm run dev:codespaces
```

The MongoDB data volume is retained across ordinary stops and starts. Stop the API and web processes with `Ctrl+C`; the companion MongoDB service is managed by Codespaces.

If `.devcontainer` changes, open the command palette and choose **Codespaces: Rebuild Container**. A rebuild reruns the post-create setup. To reset only JavaScript dependencies, run `npm ci`. Do not commit `.env`; Codespaces creates one per environment and the repository ignores it.

## Ports and security

- Use the URL in the Codespaces **Ports** panel, not `localhost:5173` in your computer's normal browser.
- Keep ports 5173 and 4000 **Private** unless you intentionally need to share a temporary preview.
- Never make MongoDB public. The Codespaces compose file does not publish or forward port 27017.
- Store real third-party credentials as GitHub Codespaces secrets later; do not put them in `.env.example` or source control.

## Troubleshooting

### The page says the host is not allowed

Stop and rerun `npm run dev:codespaces`. The launcher derives the exact forwarded host from `CODESPACE_NAME` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`; Vite allow-lists only that host.

### API is live but not ready

Run `npm run doctor`. If MongoDB is unavailable, open the Codespaces creation log from VS Code and choose **Codespaces: Rebuild Container**. Do not replace the Codespaces Mongo URI with `localhost`; the workspace reaches the companion service at hostname `mongo`.

### A port is not visible

Open the **Ports** panel and confirm 5173 and 4000 are forwarded. The application must still be running in the terminal; stopped codespaces do not keep development processes running.
