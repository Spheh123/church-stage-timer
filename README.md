# Church Stage Timer

Open `index.html` through the hosted website for controls, and `display.html`
on the laptop connected to the stage screen. The live session is shared through
Firebase; opening a controller does not load or reset a program.

- **Live view** opens by default on phones. Use **Setup view** to expand the
  service editor. The view preference is saved on each device.
- Choose a saved service slot, then press **Load Program** to load it. Selecting
  a slot alone does not change the live service. Loading, importing or resetting
  a populated program requires confirmation.
- **Connected** means the live session is synchronized. During a connection
  interruption, live controls are disabled until synchronization resumes.
- The console shows the current segment, next segment, and estimated segment
  and service finish times. Estimates appear while running and change when time
  is added or removed.
- **Stage display settings** shares theme, countdown size, and an optional logo
  across the preview and display. Use a PNG, JPG or WebP logo up to 200 KB.
- **Download program backup** exports the current running order as JSON.
  Importing prepares that program from the beginning; use **Save Program** to
  keep it in the selected service slot. Backups do not contain a live countdown.

Keep the display laptop awake. Its countdown uses deadlines, so phone sleep does
not change elapsed time. The display also advances segments without a phone
controller. Offline displays continue from their last received session; remote
changes become visible when they reconnect.

Run the automated checks with Node.js:

```sh
node --test sync.test.cjs console.test.cjs
```

Before a service, refresh the display and controller pages after an update, then
try a short practice program with two phones, including locking one phone.
