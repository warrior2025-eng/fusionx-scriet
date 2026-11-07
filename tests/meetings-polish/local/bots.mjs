// Test participants for the meeting room (port 3077): a page that joins a local LiveKit room
// as many people, each with a drawn camera picture and a tone that can be switched on and off.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const project = process.argv[2];
const lk = fs.readFileSync(path.join(project, "node_modules/livekit-client/dist/livekit-client.umd.js"));
const page = `<!doctype html><meta charset="utf-8"><body><script src="/lk.js"></script><script>
const L = window.LivekitClient;
window.bots = [];
const colors = ["#1d4ed8", "#0e7490", "#7c3aed", "#b45309", "#047857", "#be123c", "#334155", "#0f766e"];
window.addBot = async (url, token, name, opts = {}) => {
  const room = new L.Room({ adaptiveStream: false, dynacast: false });
  await room.connect(url, token, { autoSubscribe: false });
  const ctx = new AudioContext();
  const osc = ctx.createOscillator(); osc.frequency.value = 220 + (window.bots.length % 7) * 40;
  const gain = ctx.createGain(); gain.gain.value = 0;
  const dest = ctx.createMediaStreamDestination();
  osc.connect(gain).connect(dest); osc.start();
  await room.localParticipant.publishTrack(new L.LocalAudioTrack(dest.stream.getAudioTracks()[0]), { source: L.Track.Source.Microphone });
  const bot = { room, gain, ctx, name };
  if (opts.video !== false) {
    const c = document.createElement("canvas"); c.width = 320; c.height = 180;
    const g = c.getContext("2d"); const color = colors[window.bots.length % colors.length];
    const draw = () => { g.fillStyle = color; g.fillRect(0, 0, 320, 180); g.fillStyle = "#fff"; g.font = "bold 28px sans-serif"; g.fillText(name, 16, 100); };
    draw(); setInterval(draw, 400);
    const track = c.captureStream(5).getVideoTracks()[0];
    await room.localParticipant.publishTrack(new L.LocalVideoTrack(track), { source: opts.share ? L.Track.Source.ScreenShare : L.Track.Source.Camera, simulcast: false });
  }
  window.bots.push(bot);
  return window.bots.length - 1;
};
window.speak = async (i, on) => { const b = window.bots[i]; await b.ctx.resume(); b.gain.gain.value = on ? 0.6 : 0; };
window.leaveAll = async () => { for (const b of window.bots) await b.room.disconnect(); window.bots = []; };
</script>`;
http
  .createServer((req, res) => {
    if (req.url === "/lk.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(lk); }
    res.writeHead(200, { "Content-Type": "text/html" }); res.end(page);
  })
  .listen(3077, "127.0.0.1", () => console.log("bots on 3077"));
