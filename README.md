# Sprig

A mind-mapping app for the browser, modelled on [MindNode](https://www.mindnode.com) for macOS. Sprig runs in two ways:

- **On its own:** open `index.html` and start mapping. There's no build step and nothing to install, and maps are saved in your browser.
- **As a server:** run the Docker container to keep maps in a SQLite database, sign in with Google, Facebook or X, use the same maps on any device, and share read-only links. See [Run Sprig as a server](#run-sprig-as-a-server-docker).

![A product-launch mind map in Sprig, using the Meadow theme](docs/screenshot-map.png)

![The outline panel next to a tree-layout map in dark mode](docs/screenshot-outline-dark.png)

---

## Contents

- [Quick start](#quick-start)
- [Run Sprig as a server (Docker)](#run-sprig-as-a-server-docker)
- [Features](#features)
- [Using Sprig](#using-sprig)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Import and export](#import-and-export)
- [Moving maps over from MindNode](#moving-maps-over-from-mindnode)
- [Where your maps are stored](#where-your-maps-are-stored)
- [How it works](#how-it-works)
- [Browser support](#browser-support)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start

You only need a modern web browser. Python or Node.js is optional and only used to serve the file locally.

### 1. Get the code

```bash
git clone https://github.com/skarlekar/sprig.git
cd sprig
```

### 2. Start the app

Pick one of these options.

**Option A: open the file directly (simplest)**

```bash
open index.html            # macOS
xdg-open index.html        # Linux
start index.html           # Windows
```

Or double-click `index.html` in your file manager. This works in Chrome, Edge and Safari.

**Option B: serve it locally (recommended)**

A local web server gives the app a stable origin, so your saved maps persist reliably in every browser, including Firefox.

With Python 3 (installed on macOS and most Linux systems):

```bash
python3 -m http.server 8000
```

With Node.js:

```bash
npx serve .
```

Then open <http://localhost:8000> (Python) or the URL that `serve` prints (Node).

To stop the server, press `Ctrl+C` in the terminal.

### 3. Try it

On first launch Sprig loads three example maps: **Launch: Field Notes 2.0**, **Creativity** and **Dinner Party**. Click any node, press `Tab` to add a child, type, and press `Return`. Open the **Documents** panel (the sidebar icon next to the logo) to switch maps or start a new one.

> Fonts (Jost and Figtree) load from Google Fonts. Offline, Sprig falls back to your system fonts and everything else keeps working.

---

## Run Sprig as a server (Docker)

Server mode stores your maps in a SQLite database inside a Docker volume and puts everything behind sign-in. Only the email addresses you list can get in. It adds:

- **Your maps on every device.** Sign in anywhere and pick up where you left off.
- **Offline-safe saving.** Every change is first written to the browser, then sent to the server. If the connection drops, the save chip shows **Offline** and the changes are sent when it returns.
- **Conflict handling.** If the same map was changed on another device, Sprig asks whether to keep both versions, use the saved one, or use yours. Both versions are always kept in the map's history.
- **One editing tab per map.** A second tab on the same map is view only, with an **Edit here instead** button.
- **Read-only share links.** Click **Share**, turn the link on, and send it. Anyone with the link can view, fold, search and export the map without signing in. **Reset link** makes a new link and stops the old one.
- **Account menu** (your initial, top right): **Download all my maps** as a zip of Sprig JSON files, **Recently deleted** (restore within 30 days), and **Sign out**.

### Requirements

- Docker Desktop (or Docker Engine with the Compose plugin)
- `openssl` to generate secrets (built into macOS and Linux)

### The quick way

```bash
./start.sh    # builds and starts the container, waits until it answers, opens your browser
./stop.sh     # stops it; your maps are kept for next time
```

On the first run, `start.sh` creates `.env` with fresh secrets and local test sign-in for your Git email address (or `SPRIG_EMAIL=you@example.com ./start.sh`). It also starts Docker Desktop on macOS if it isn't running. The steps below do the same by hand and explain each setting.

### 1. Create your settings file

```bash
cp .env.example .env
```

Edit `.env`:

| Setting | What to put |
|---|---|
| `PUBLIC_URL` | `http://localhost:8080` for local use |
| `ALLOWED_EMAILS` | The email addresses allowed to sign in, comma-separated |
| `OWNER_EMAIL` | Your email; it must also be in `ALLOWED_EMAILS` |
| `SESSION_SECRET` | Output of `openssl rand -hex 32` |
| `SHARE_KEY` | Output of another `openssl rand -hex 32` |
| `DEV_LOGIN` | `1` to sign in locally without Google (localhost only) |
| `GOOGLE_…`, `FACEBOOK_…`, `X_CLIENT_ID` / `_SECRET` | From step 3. Set the pairs for the providers you want; all are optional while `DEV_LOGIN=1` |

Sprig refuses to start, and says why, if a secret is missing or too short, or if `DEV_LOGIN` is on while `PUBLIC_URL` isn't localhost.

### 2. Start it

```bash
docker compose up -d --build
```

Open <http://localhost:8080> and click **Continue as … (local test)**. The first sign-in creates the three example maps.

| Task | Command |
|---|---|
| See the logs | `docker compose logs -f` |
| Stop | `docker compose down` |
| Update after pulling new code | `docker compose up -d --build` |
| Delete all server data (careful) | `docker compose down -v` |
| Back up the database | `docker compose cp sprig:/data/sprig.db ./sprig-backup.db` |

The port is bound to `127.0.0.1`, so only your own computer can reach it.

### 3. Turn on social sign-in

Each provider needs a one-time registration on its developer site. That's how the provider knows which app is asking and where to send people back after they sign in; there's no way around it for a self-hosted app. Each one shows a button on the sign-in page once both of its values are in `.env`. After editing `.env`, run `./stop.sh && ./start.sh` again.

| Provider | Cost | Can open an account | Notes |
|---|---|---|---|
| Google | Free | Yes | Recommended starting point. Only Google accounts can use it. |
| Facebook | Free | No, connect it after signing in | Needs HTTPS for its redirect address; see below. |
| X | Paid API plan | Yes | X ended free API access in 2026, so sign-in can't finish on the Free tier. |

Sprig lets someone in only when the provider confirms their email address and that address is in `ALLOWED_EMAILS`. Use the same address you put there when you sign in for the first time.

Keep `PUBLIC_URL` and the redirect addresses you register exactly in step: the same host (`localhost` or `127.0.0.1`), port and path. A mismatch is the most common sign-in error. Sprig also only answers requests addressed to the host in `PUBLIC_URL` (others get **Wrong address**), which blocks DNS-rebinding attacks on a local server, so open it at exactly that address.

#### Google

1. In [Google Cloud console](https://console.cloud.google.com/projectcreate), create a project (for example **Sprig**), so its settings stay separate from your other work.
2. Open **Google Auth Platform → Get started**. Enter the app name and support email, choose **External** as the audience, add a contact email, and agree to Google's user data policy.
3. Under **Clients → Create client**, choose **Web application** and add `http://localhost:8080/auth/google/callback` under **Authorised redirect URIs**. On a server, use your real address instead.
4. Copy the **Client ID** and **Client secret** from the dialog into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Google shows the secret only once.
5. Under **Audience → Test users**, add each Google account allowed to sign in. While the app is in **Testing**, Google blocks everyone else too, as a second gate. Non-Google addresses (such as Yahoo) can't be added.

Changes to redirect addresses can take a few minutes to apply. If you see `redirect_uri_mismatch` right after a change, wait and try again.

#### Facebook

1. At [Meta for Developers](https://developers.facebook.com/apps), create an app with the **Authenticate and request data from users with Facebook Login** use case.
2. Choose not to connect a business portfolio. Business verification and App Review are only needed to open the app to the public.
3. Under the use case's **Permissions and features**, click **Add** next to `email`. `public_profile` is already there.
4. Leave the app in **Development** mode. Only people with a role on the app (you) can sign in, which acts as a second gate.
5. From **App settings → Basic**, copy the **App ID** to `FACEBOOK_CLIENT_ID` and the **App secret** (click **Show**) to `FACEBOOK_CLIENT_SECRET`.
6. Redirect address: Facebook enforces HTTPS and refuses to list any `http://` address, including `localhost` and `127.0.0.1`. In Development mode Facebook allows `http://localhost` without listing it (tested), so run Sprig at `http://localhost:8080` (not `127.0.0.1`) locally. On a server with HTTPS, add `https://<your domain>/auth/facebook/callback` under **Facebook Login → Settings → Valid OAuth Redirect URIs**.

Facebook doesn't say whether the email it shares is verified, so Sprig never lets Facebook open an account or find one by email. Connect it once from **Account → Sign-in methods** while signed in with Google, X or the local test sign-in. After that, **Continue with Facebook** works. Sprig uses Graph API `v26.0`; set `FACEBOOK_GRAPH_VERSION` to change it.

#### X

> **X now needs a paid plan.** In 2026 X deprecated its Free API tier. Sign-in itself still works, but Sprig then has to call `GET /2/users/me` to read your email, and on the Free tier X answers `403`. Use X only with a paid plan (for example X's Pay Per Use).

1. At the [X Developer Portal](https://developer.x.com/en/portal/dashboard), open your app's **User authentication settings**.
2. Turn on **OAuth 2.0**, choose **Web App, Automated App or Bot** (a confidential client), and set **App permissions** to **Read**.
3. Turn on **Request email from users**. X requires links to a privacy policy and terms of service for this setting.
4. Add `http://127.0.0.1:8080/auth/x/callback` as a **Callback URI**. X's docs ask for `127.0.0.1` rather than `localhost` for local testing, so set `PUBLIC_URL=http://127.0.0.1:8080` too.
5. Copy the OAuth 2.0 **Client ID** and **Client Secret** to `X_CLIENT_ID` and `X_CLIENT_SECRET`. These aren't the "API Key and Secret". On the **Keys and tokens** page, **Regenerate** shows a new secret once.

X shares the account's confirmed email through the `users.email` scope. Accounts without a confirmed email can't sign in.

#### Using more than one provider

The first provider you sign in with opens your account. For security, Sprig won't silently attach a second provider just because the email matches. If you try, it asks you to connect it first: sign in the usual way, open the account menu (your initial, top right), and under **Sign-in methods** click **Connect** next to Facebook or X. After that you can sign in with any of them, even if that provider has a different email address on file. **Disconnect** removes a method, but Sprig always keeps at least one.

Set `DEV_LOGIN=` (empty) to remove the local test button once a real provider works.

### Who can get in

- A new sign-in needs an email address the provider has confirmed (Google or X), and that address must be in `ALLOWED_EMAILS`. Facebook works only once connected to an existing account. Anyone else sees **Access not granted**, and nothing is stored about them.
- The allowlist is checked on every request. Remove an address and restart, and that person is signed out at once.
- Sessions last 30 days and are extended as you use Sprig.

### Running the server without Docker

Needs Node.js 24 or later.

```bash
cd server
npm install
set -a; source ../.env; set +a
DATA_DIR=../data npm start
npm test        # 29 tests
```

---

## Features

**Mapping**
- Infinite canvas with smooth pan (scroll or drag) and zoom (pinch, `⌘` + scroll, or the toolbar).
- Three layouts: **Mind map** (branches balanced on both sides), **Right** (all branches on one side) and **Tree** (top-down columns with indented lists).
- Tapered curved branches or angled branches, colored per first-level branch.
- Several main nodes per map: double-click empty canvas to add one.
- **Cross connections**: dashed arrows linking ideas in different branches.
- A **+** button appears when you hover over a node, so you can grow the map with the mouse alone.
- Drag and drop to nest a node, reorder it, or detach it as a new main node.
- Fold and unfold branches. A folded branch shows how many nodes it hides.

**Content**
- **Tasks**: turn any node into a checkbox. Parent nodes show a progress ring for the tasks below them.
- **Notes**: attach longer text to any node. A small page icon marks nodes with notes.
- **Stickers**: 48 emoji stickers. Main and first-level nodes show them large above the text.
- Bold, italic, per-branch colors and node shapes (box, pill, underline).

**Working with ideas**
- **Outline**: a live, editable outline next to the map that stays in sync with it.
- **Quick Entry**: type or paste an indented list and turn it into a map in one step.
- **Focus mode**: dims everything except the selected branch.
- **Find**: searches node text and notes, unfolds hidden matches and jumps to each one.
- Undo and redo, up to 300 steps per session.
- Copy, cut and paste branches. Pasting plain text from anywhere creates nodes.

**Looks**
- Five themes: **Meadow**, **Harbor**, **Ember**, **Ink** and **Blueprint**. Each has a light and a dark version that follows your system setting.
- Responsive layout that works on tablets and phones, with touch panning and pinch zoom.

**Files**
- Export to PNG (2×), SVG, Markdown, OPML, plain text outline and Sprig JSON.
- Import OPML, Markdown, plain text and Sprig JSON, from the Import button or by dragging a file onto the canvas.
- Maps save automatically as you work.

---

## Using Sprig

### The toolbar

| Button | What it does |
|---|---|
| Sidebar icon | Show the Documents panel: switch maps, create a new map, delete a map |
| Title field | Rename the current map |
| Undo / Redo | Step backward and forward through changes |
| Child / Sibling | Add a node below or next to the selected node |
| Connection icon | Start a cross connection from the selected node, then click the target |
| Focus | Spotlight the selected branch |
| Outline | Show the editable outline |
| Lightning bolt | Open Quick Entry |
| Magnifier | Find in the map |
| − / % / + | Zoom out, fit the map to the window, zoom in |
| Import / Export | Load a file, or save the map in another format |
| Panel icon | Show the Inspector |
| ? | Show keyboard shortcuts |

### Editing nodes

- **Select** a node by clicking it, and **edit** it by double-clicking, pressing `Space`, or just typing.
- **Add nodes with the mouse:** hover over a node (or select it) and a round **+** button appears just past its outer edge. Click it to add a child, or `Shift`-click it to add a sibling. The new node opens for typing right away.
- While editing, `Return` finishes, `Shift+Return` adds a line break, and `Tab` finishes and adds a child.
- Press `Backspace` on a selected node (not while editing) to delete it and its branch.

### The Inspector

Open it with the panel icon or `⌘I`. With a node selected you can:

- Toggle **bold** and **italic**, or make the node a **task**.
- Change the **shape**: Auto, Box, Pill or Line (underline).
- Set a **branch color**. The color flows down to all of the node's descendants unless a child sets its own.
- Add or remove a **sticker**.
- Write a **note**.

For the whole map you can choose the **theme**, **layout** and **branch style**, fold or unfold everything, and see counts of nodes, tasks done, main nodes and cross connections.

### Quick Entry

Open it with the lightning-bolt button or `⌘E`. Type one idea per line and indent with `Tab` (or spaces) to nest ideas:

```
Trip to Lisbon
	Before we go
		[ ] Book flights
		[x] Renew passport
	Days
		Belém
		Sintra day trip
```

Choose **New map** or **Under selected node**, then click **Create map** (or press `⌘Return`). Quick Entry understands:

- Indentation with tabs or spaces
- Bullets: `-`, `*`, `+`, `•`, `1.`, `1)`
- Markdown headings: `#`, `##`, … (each level nests under the one before)
- Tasks: `[ ]` for open, `[x]` for done

### The outline

Open it with the Outline button or `⌘2`. It mirrors the map and you can edit it directly:

| Key | Action |
|---|---|
| `Return` | New item below |
| `Tab` / `Shift+Tab` | Indent / outdent |
| `Backspace` on an empty item | Delete it |
| `↑` / `↓` | Move between items |
| `Esc` | Return to the map |

Click the triangles to fold branches and the checkboxes to complete tasks.

### Drag and drop

Drag any node that isn't a main node:

- **Onto the middle of another node** to make it a child.
- **Near the top or bottom edge of a node** to place it before or after that node.
- **Onto empty canvas** to detach it as a new main node.

Drag a main node to move the whole map.

---

## Keyboard shortcuts

On Windows and Linux, use `Ctrl` where the table says `⌘`.

| Shortcut | Action |
|---|---|
| `Tab` | Add a child node |
| `Return` | Add a sibling node |
| `Space`, `F2` or start typing | Edit the selected node |
| `Shift+Return` | New line while editing |
| `←` `→` `↑` `↓` | Move between nodes |
| `⌘↑` / `⌘↓` | Move the node up or down among its siblings |
| `Backspace` / `Delete` | Delete the selected node or cross connection |
| `⌘/` | Fold or unfold the selected branch |
| `⌘D` | Turn a node into a task, check it off, then remove the task |
| `⌘B` | Bold |
| `⌘L` | Start a cross connection |
| `⇧⌘F` | Focus mode |
| `⌘F` | Find (`Return` and `Shift+Return` step through matches) |
| `⌘E` | Quick Entry |
| `⌘2` | Toggle the outline |
| `⌘I` | Toggle the Inspector |
| `⌘C` / `⌘X` / `⌘V` | Copy, cut and paste branches |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘0` | Fit the map to the window |
| `⌘+` / `⌘−` | Zoom in / out |
| `Esc` | Leave connect mode, focus mode or Find |
| `?` | Show the shortcut list |

---

## Import and export

| Format | Export | Import | Keeps |
|---|:-:|:-:|---|
| **Sprig JSON** (`.sprig.json`) | ✓ | ✓ | Everything: layout, theme, colors, shapes, stickers, tasks, notes, cross connections |
| **OPML** (`.opml`) | ✓ | ✓ | Hierarchy, notes (`_note`), task state (`_status`) |
| **Markdown** (`.md`) | ✓ | ✓ | Hierarchy and tasks. Stickers and notes are written as text (notes as `>` quotes), so on re-import they come back as plain text and nodes |
| **Plain text** (`.txt`) | ✓ | ✓ | Tab-indented hierarchy and tasks |
| **PNG** | ✓ | | The map as an image at 2× resolution |
| **SVG** | ✓ | | The map as a vector image |

In the Export dialog, **Download** saves a file and **Copy** puts the text (or PNG image) on your clipboard. OPML opens in most outliners, including OmniOutliner, Logseq and Workflowy.

Use **Sprig JSON** for backups: it's the only format that restores a map exactly.

---

## Moving maps over from MindNode

MindNode saves `.mindnode` files in a proprietary binary format, so Sprig can't open them directly. To bring a map across:

1. Open the map in MindNode.
2. Choose **File → Export** and pick **OPML** (or **Markdown**).
3. In Sprig, click **Import** and select the exported file, or drag it onto the canvas.

Hierarchy, notes and tasks come across. Reapply styling such as themes and colors in Sprig's Inspector.

---

## Where your maps are stored

**Server mode:** maps live in the SQLite database at `/data/sprig.db` inside the `sprig_data` Docker volume. Each browser also keeps unsent changes under `sprig.outbox.*` keys until the server confirms them. Older versions of each map are kept automatically: every version from the last day, then one per hour for a week, then one per day for 90 days.

If you used Sprig on its own in the same browser at the same address, server mode offers to upload those maps after you sign in.

**On its own:** maps are saved automatically in your browser's `localStorage`, under keys that start with `sprig.`. This means:

- Nothing is uploaded anywhere. Your maps never leave your computer.
- Maps are tied to the browser **and** the address you opened Sprig from. `file:///…/index.html` and `http://localhost:8000` keep separate collections, and so do different browsers.
- Clearing your browser's site data deletes your maps.

**Back up maps you care about** by exporting them as Sprig JSON. To move maps between browsers or computers, export them as Sprig JSON and import them on the other side.

---

## How it works

The editor is three static files: `index.html` (markup and CSS), `app.js` (the app) and `sanitize.js` (map checks shared with the server). A `<meta name="sprig-mode">` tag tells `app.js` whether to save in the browser (`local`), on the server (`server`), or show a read-only shared map (`viewer`).

| Part | Responsibility |
|---|---|
| **Document model** | A map is plain JSON: `{ title, theme, layout, branch, roots: [node], connections: [{from, to}] }`. A node is `{ id, text, children, collapsed?, task?, note?, sticker?, color?, shape?, bold?, italic? }`. Main nodes also carry `x` and `y`. |
| **Measuring** | Text is measured and wrapped with an off-screen canvas, so node sizes are known before anything is drawn. |
| **Layout** | Pure functions compute every node's position for the active layout. Mind map and Right stack subtrees by height; Tree places first-level branches in columns with indented lists below. |
| **Scene** | Layout output becomes a list of drawing primitives (paths, rectangles, circles, text). |
| **Renderers** | The same scene is drawn as SVG for the live canvas and SVG export, and on a `<canvas>` for PNG export, so exports match what's on screen. |
| **History** | Each change stores a JSON snapshot of the map, giving reliable undo and redo. |
| **Persistence** | On its own, saves are debounced and written to `localStorage`. In server mode, each change goes to an outbox in `localStorage` immediately, and is sent 1 second later with the version it was based on (`If-Match`). The server answers 409 if the map changed elsewhere. |
| **Server** | Node 24 and Fastify in `server/`, with Node's built-in `node:sqlite`. It handles sign-in with Google (OpenID Connect with PKCE), Facebook and X (OAuth 2.0 with PKCE), sessions, the maps API, share links and daily cleanup, and sends a strict Content Security Policy. Share tokens are stored hashed and encrypted, and are redacted from logs. |

The only external resource in the browser is the Google Fonts stylesheet.

### Project layout

```
sprig/
├── index.html        # markup and styles
├── app.js            # the editor
├── sanitize.js       # map checks, shared by browser and server
├── server/           # Node server: src/ (app, auth, db), test/
├── Dockerfile
├── compose.yaml
├── start.sh / stop.sh # start or stop the server and open the browser
├── .env.example      # settings template; copy to .env
├── README.md
├── PRIVACY.md        # privacy policy (linked from provider sign-in screens)
├── TERMS.md          # terms of service
├── LICENSE           # MIT
├── docs/             # screenshots used in this README
└── .gitignore
```

---

## Browser support

Sprig works in current versions of Chrome, Edge, Safari and Firefox on desktop, and in Safari and Chrome on iOS and Android. It uses standard features such as SVG, Canvas 2D, `Path2D`, `roundRect` and `contenteditable="plaintext-only"`.

---

## Known limitations

- Can't open `.mindnode` files directly. Export OPML from MindNode instead (see [above](#moving-maps-over-from-mindnode)).
- On its own, maps live in one browser. Server mode syncs between devices but has no real-time co-editing: one device edits a map at a time, and conflicts are resolved by choice.
- Server mode has no Version history or Trash screens yet (planned). Old versions are already saved and can be restored through the API.
- No images or file attachments inside nodes.
- No export to Apple Reminders, Things or OmniFocus.
- Cross connections can't have labels yet.
- SVG exports use the fonts installed on the viewing computer. PNG exports embed the app's fonts.

---

## Contributing

Issues and pull requests are welcome. There's no build step:

1. Edit `index.html`, `app.js` or `sanitize.js`, then reload the page.
2. For server changes, run `cd server && npm test`, then `docker compose up -d --build`.

Before opening a pull request, check:

- All three layouts, in light and dark mode.
- Undo and redo after the change.
- Exporting to PNG and Sprig JSON, then importing the JSON again.
- A narrow (phone-sized) window.

## License

Sprig is released under the [MIT License](LICENSE). You're free to use, modify and distribute it, including commercially, as long as you keep the copyright notice.

---

Sprig is an independent project and isn't affiliated with or endorsed by MindNode or IdeasOnCanvas GmbH. MindNode is a trademark of its owners.
