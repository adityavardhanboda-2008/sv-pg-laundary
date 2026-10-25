import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

const config = {
  apiKey: "AIzaSyCFuP3CzbaSd4cHDBkCmTE-EL8ZQlI5vJ0",
  authDomain: "sv-pg-laundary.firebaseapp.com",
  databaseURL: "https://sv-pg-laundary-default-rtdb.firebaseio.com",
  projectId: "sv-pg-laundary",
  storageBucket: "sv-pg-laundary.firebasestorage.app",
  messagingSenderId: "1088324864957",
  appId: "1:1088324864957:web:15bb2b4a023457d49360d4",
  measurementId: "G-ZCPJ55N06L"
};

const app = initializeApp(config);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const WASH = 90 * 60 * 1000;

const buildings = {
  mess: {
    name: "Mess Building",
    machines: [
      ["mess_left", "Left Machine", "Left side"],
      ["mess_right", "Right Machine", "Right side"]
    ]
  },
  old: {
    name: "Old Building",
    machines: [
      ["old_2nd", "2nd Floor Machine", "2nd floor"],
      ["old_3rd", "3rd Floor Machine", "3rd floor"]
    ]
  },
  new: {
    name: "New Building",
    machines: [
      ["new_single", "Main Machine", "Single machine"]
    ]
  }
};

let user = null;
let building = null;
let machine = null;

const sessions = {};
const queues = {};
const $ = id => document.getElementById(id);

const time = t => new Date(t).toLocaleTimeString([], {
  hour: "numeric",
  minute: "2-digit"
});

const duration = ms => {
  const n = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h ${m}m` : `${m} min`;
};

function isBusy(s) {
  return !!s &&
    s.status === "occupied" &&
    typeof s.startedAt === "number" &&
    Number.isFinite(s.startedAt) &&
    Date.now() - s.startedAt < WASH;
}

$("loginButton").onclick = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    $("loginMessage").textContent = "Sign-in error: " + e.message;
  }
};

$("logoutButton").onclick = () => signOut(auth);

onAuthStateChanged(auth, u => {
  user = u;
  $("loginButton").hidden = !!u;
  $("logoutButton").hidden = !u;
  $("loginMessage").textContent = u
    ? `Signed in as ${u.email || "Google account"}`
    : "Sign in with Google to manage a wash or join a queue.";
  render();
});

document.querySelectorAll("[data-building]").forEach(b => {
  b.onclick = () => {
    building = b.dataset.building;
    $("buildingView").hidden = true;
    $("machinesView").hidden = false;
    $("queueView").hidden = true;
    $("buildingTitle").textContent = buildings[building].name;
    render();
  };
});

$("backBuildings").onclick = () => {
  $("buildingView").hidden = false;
  $("machinesView").hidden = true;
  $("queueView").hidden = true;
  building = null;
  machine = null;
};

$("closeQueue").onclick = () => {
  $("queueView").hidden = true;
  $("machinesView").hidden = false;
  machine = null;
};

$("joinQueue").onclick = async () => {
  if (!user) return alert("Sign in first");

  try {
    await runTransaction(ref(db, `queues/${machine}/${user.uid}`), v =>
      v || {
        joinedAt: Date.now(),
        displayName: user.displayName || user.email || "Resident"
      }
    );
    renderQueue();
  } catch (e) {
    alert("Could not join queue: " + e.message);
  }
};

$("leaveQueue").onclick = async () => {
  if (!user) return;

  try {
    await runTransaction(ref(db, `queues/${machine}/${user.uid}`), () => null);
    renderQueue();
  } catch (e) {
    alert("Could not leave queue: " + e.message);
  }
};

function render() {
  if (building) renderMachines();
  if (machine) renderQueue();
}

function renderMachines() {
  const list = buildings[building].machines;

  $("machineList").innerHTML = list.map(([id, name, detail]) => {
    const s = sessions[id];
    const busy = isBusy(s);

    const q = Object.entries(queues[id] || {})
      .filter(([, v]) => v?.joinedAt)
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

    const my = q.findIndex(([uid]) => uid === user?.uid);
    const end = busy ? s.startedAt + WASH : Date.now();
    const wait = end - Date.now() +
      Math.max(0, my < 0 ? q.length : my) * WASH;

    return `<article class="card">
      <div class="cardtop">
        <div><small>${detail}</small><h3>${name}</h3></div>
        <span class="badge ${busy ? "busy" : ""}">
          ${busy ? "OCCUPIED" : "AVAILABLE"}
        </span>
      </div>
      <div class="stats">
        <div class="stat">
          <small>Status</small><b>${busy ? "In use" : "Ready"}</b>
        </div>
        <div class="stat">
          <small>${busy ? "Wash ends approx." : "Next start"}</small>
          <b>${busy ? time(end) : "Now"}</b>
        </div>
        <div class="stat">
          <small>Queue</small><b>${q.length} waiting</b>
        </div>
      </div>
      <button data-action="in" data-id="${id}" ${!user || busy ? "disabled" : ""}>
        IN · Start wash
      </button>
      <button class="secondary" data-action="out" data-id="${id}"
        ${!user || !busy || s.startedBy !== user.uid ? "disabled" : ""}>
        OUT · Finish
      </button>
      <button class="secondary" data-action="queue" data-id="${id}">
        Queue / ETA
      </button>
      ${my >= 0 ? `<p>You are #${my + 1}. Estimated wait: ${duration(wait)}.</p>` : ""}
    </article>`;
  }).join("");

  $("machineList").querySelectorAll("[data-action]").forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.id;

      try {
        if (b.dataset.action === "in") {
          if (!user) return alert("Sign in first");

          const result = await runTransaction(ref(db, `machines/${id}`), v => {
            if (isBusy(v)) return;

            return {
              status: "occupied",
              startedAt: Date.now(),
              startedBy: user.uid,
              updatedAt: Date.now()
            };
          });

          if (!result.committed) {
            alert("Already occupied. Join queue instead.");
          }

        } else if (b.dataset.action === "out") {
          const result = await runTransaction(ref(db, `machines/${id}`), v =>
            v?.status === "occupied" && v.startedBy === user?.uid
              ? {
                  status: "available",
                  startedAt: null,
                  startedBy: null,
                  updatedAt: Date.now()
                }
              : undefined
          );

          if (!result.committed) {
            alert("Only the person who started the wash can press OUT.");
          }

        } else {
          machine = id;
          $("machinesView").hidden = true;
          $("queueView").hidden = false;
          renderQueue();
        }

        render();
      } catch (e) {
        alert("Database error: " + e.message);
      }
    };
  });
}

function renderQueue() {
  if (!machine) return;

  const found = Object.values(buildings)
    .flatMap(b => b.machines)
    .find(m => m[0] === machine);

  const s = sessions[machine];
  const busy = isBusy(s);

  const q = Object.entries(queues[machine] || {})
    .filter(([, v]) => v?.joinedAt)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  const mine = q.findIndex(([uid]) => uid === user?.uid);
  const start = busy ? s.startedAt + WASH : Date.now();

  $("queueTitle").textContent = "Queue · " + found[1];

  $("queueSummary").textContent = mine >= 0
    ? `You are #${mine + 1}. Estimated wait: ${duration(start - Date.now() + mine * WASH)}. Average wash: 90 minutes.`
    : `${q.length} waiting. Average wash time is 90 minutes. Join the queue to get an estimated wait.`;

  $("queueList").innerHTML = q.length
    ? q.map(([uid, v], i) => `
        <div class="queueitem">
          <span>${i + 1}</span>
          <div>
            <b>${esc(v.displayName || "PG resident")}</b>
            <small>Estimated start: ${time(start + i * WASH)}</small>
          </div>
          ${uid === user?.uid ? "<b>YOU</b>" : ""}
        </div>
      `).join("")
    : "<p>No one is waiting.</p>";

  $("joinQueue").hidden = mine >= 0;
  $("joinQueue").disabled = !user;
  $("leaveQueue").hidden = mine < 0;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

for (const b of Object.values(buildings)) {
  for (const [id] of b.machines) {
    onValue(ref(db, `machines/${id}`), snap => {
      sessions[id] = snap.val();

      const s = sessions[id];

      if (
        s?.status === "occupied" &&
        typeof s.startedAt === "number" &&
        Date.now() - s.startedAt >= WASH
      ) {
        runTransaction(ref(db, `machines/${id}`), v =>
          v?.status === "occupied" &&
          typeof v.startedAt === "number" &&
          Date.now() - v.startedAt >= WASH
            ? {
                status: "available",
                startedAt: null,
                startedBy: null,
                updatedAt: Date.now()
              }
            : undefined
        ).catch(console.error);
      }

      render();
    }, e => console.error("Machine listener error:", e));

    onValue(ref(db, `queues/${id}`), snap => {
      queues[id] = snap.val() || {};
      render();
    }, e => console.error("Queue listener error:", e));
  }
}

setInterval(render, 15000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(console.error);
      }
