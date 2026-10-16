// Talks to start.ng through its hidden connect page (https://start.ng/docs).
// Opened as a local file or outside *.start.ng the page never answers, and
// every helper here resolves to null so the game still plays.

const START_NG = 'https://start.ng';
let frame;

function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

// Sends a message and resolves to start.ng's reply, or null if it didn't answer.
export async function askStartNg(message, replyType, timeoutMs = 5000) {
  let el;
  try {
    el = await connectFrame();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

/** Who is playing: { user, guest } or null when start.ng is not reachable. */
export function whoami() {
  return askStartNg({ type: 'startng:whoami' }, 'startng:user');
}

/** Saves a run for a signed-in player. stats must match startng.json. */
export function saveRun(stats) {
  return askStartNg({ type: 'startng:score', stats }, 'startng:scoreSaved');
}

/** The top players, guests included. */
export async function leaderboard(limit = 10) {
  const reply = await askStartNg({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData');
  return reply?.ok ? reply.entries : null;
}

/** Sends the player to start.ng to sign in; they come straight back here. */
export function signIn() {
  location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

/** True when the start.ng homepage opened the game for a guest. */
export const openedAsGuest = new URLSearchParams(location.search).has('guest');
