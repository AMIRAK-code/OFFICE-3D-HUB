# 🏢 Office Board

An interactive 3D office for your team. Everyone shows up as a live cursor with their avatar, and the room is the dashboard: click the radio, the TV, the basket and the rest.

## Features

| In the room | What it does |
| --- | --- |
| **Live cursors** | Everyone's pointer appears in real time with their avatar, first name and mood emoji. |
| **🎨 The Wall** (corkboard) | Upload stickers (PNG/JPG/WEBP/GIF) or use the starter emoji pack, then drag them onto the wall. You can move, rotate, resize or remove your own. You can also drop an image file from your desktop straight onto the wall. |
| **📻 Podcast Radio** | Recommend podcasts and like other people's picks. The radio plays notes while it's open. |
| **📺 Movie & Series TV** | Recommend movies and series with a platform and rating. The TV switches on and runs a slideshow of the recommendations. |
| **🧺 Too Good To Go basket** | List things to give away. Colleagues reserve them ("first come, first served"), and you mark them as given. |
| **🎂 Birthday board** | Add your birthday (day and month only). When it's someone's birthday the office celebrates: balloons, a cake with candles you can blow out, confetti, a banner with their avatar, and the birthday song. |
| **📌 Request box** | Post requests publicly or anonymously and pin them to the wall as sticky notes. Others can +1 them and mark them done. Anonymous notes are never linked to a name, not even on the server. |
| **💌 Sticker mail** | Send a sticker with a short message to a colleague. It flies onto their screen. |
| **😀 Mood** | Set a mood emoji. It appears next to your cursor and in the people list. |
| **🎵 Jukebox** | Five lo-fi tracks generated live in the browser. Everyone shares one player (anyone can play, pause or change track), but your own speaker is **always muted when you enter** until you click 🎧. |
| **📍 Top Places** (window) | Share restaurants, cafés and shops with a Google Maps link or an address. Likes and comments. |
| **📚 Book Club** (bookshelf) and **🎵 Music** (radio tab) | More recommendation lists, all with likes and comments. |
| **📝 Text notes, 🗑️ trash can** | Write notes onto the wall; drag your stickers and notes into the trash can to delete them. |
| **🎯 Darts** (left wall) | Two-player darts: 3 rounds of 3 darts, time the swaying crosshair. |
| **🕹️ Game arcade** | Two-player Tic-Tac-Toe, Connect Four and Rock-Paper-Scissors. You can open a table or invite someone directly. |

Other details: a working wall clock, a window whose sky follows the real time of day, a neon sign with your office name, and fairy lights. On phones you swipe sideways to look around the room.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000. Colleagues on the same network use the **Network** address printed in the terminal (for example `http://192.168.1.150:3000`).

### How sign-in works

Everyone enters their **name and surname**. That pair is your identity (it ignores upper/lower case). Enter the same name and surname next time and the office remembers you.

Anyone who knows a colleague's name could sign in as them. If the board can be reached from outside your office network, also set an **office passcode** that everyone has to enter:

```powershell
# Windows PowerShell
$env:OFFICE_PASSCODE = "choose-something"; $env:OFFICE_NAME = "Acme HQ"; npm start
```

```bash
# macOS / Linux
OFFICE_PASSCODE=choose-something OFFICE_NAME="Acme HQ" npm start
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `OFFICE_PASSCODE` | *(none)* | Shared passcode required at sign-in |
| `OFFICE_ADMINS` | `Amir Akbari` | Comma-separated full names allowed to remove anyone's stickers and wall notes |
| `OFFICE_NAME` | `Office Board` | Shown on the login screen, in the top bar and on the neon sign |
| `DATA_DIR` | `./data` | Where the database and uploaded images are stored |

## Data and backups

All data is in `data/db.json`, and uploaded images are in `data/uploads/`. To back up the office, copy the `data` folder. To reset it, stop the server and delete the folder. Games in progress are kept in memory only.

## Hosting

The server keeps live connections open and writes to local disk, so it needs a long-running Node host with persistent storage. Good options:

- a spare office machine
- a small VM
- Render, Railway or Fly.io with a mounted volume (point `DATA_DIR` at the volume)

Purely serverless hosting will not keep the data.

## Tips

- **Preview the birthday party** at any time: open the Birthday board and click **✨ Preview a birthday party**.
- Right-click your own sticker or note on the wall for rotate, resize, bring-to-front and delete.
- Sound effects and music can be muted with the 🔊 button. Browsers only allow sound after your first click on the page.

## Project layout

```
server/
  index.js     Express app: login, uploads, static files
  hub.js       Socket.IO realtime hub: presence, cursors, all board actions
  games.js     Server-side rules for the mini games
  db.js        JSON-file database (data/db.json)
  uploads.js   Image upload validation
public/
  index.html, css/style.css
  js/main.js           boot and wiring
  js/net.js            socket, shared store, event bus
  js/scene/            Three.js: core (camera, picking), room (all props), wall, fx
  js/features/         radio/TV, basket, birthdays, requests, games, stickers, mail
  js/ui/               HUD, panels/popovers/modals, login
```
