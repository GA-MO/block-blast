import Phaser from "phaser";
import { DESIGN, THEME } from "./config";
import { BootScene } from "./scenes/BootScene";
import MenuScene from "./scenes/MenuScene";
import { GameScene } from "./scenes/GameScene";
import LevelSelectScene from "./scenes/LevelSelectScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: THEME.bgBottom,
  width: DESIGN.width,
  height: DESIGN.height,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Casual 2-D puzzle: don't force the high-power GPU. "high-performance" pins the
  // discrete/boost GPU and blocks OS throttling (runs hot + drains battery); the
  // default lets the device pick a low-power path — and it's the heat win that
  // costs nothing visually. antialias stays on: turning it off left sprite edges
  // visibly jagged for no meaningful extra saving.
  render: { antialias: true, roundPixels: true, powerPreference: "default" },
  // 3 touch pointers: a stray second finger resting on the screen must not
  // steal or cancel the active drag (with 1, dragging intermittently fails).
  input: { activePointers: 3 },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, GameScene, LevelSelectScene],
});

// Mobile browsers resize the visible viewport when the address bar or home
// indicator shows/hides. With FIT + autoCenter the canvas re-centres (gaining a
// letterbox margin), but Phaser's cached pointer bounds can go stale — every tap
// then maps offset by that margin, so a button's lower half feels dead and taps
// just *above* it register instead. Refresh the scale manager on any viewport
// change so pointer math stays aligned with the on-screen canvas.
const refreshScale = () => game.scale.refresh();
window.addEventListener("resize", refreshScale);
window.addEventListener("orientationchange", refreshScale);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", refreshScale);
  window.visualViewport.addEventListener("scroll", refreshScale);
}

// Stop the render/update loop entirely while the app isn't visible (tab hidden,
// app backgrounded, screen off). The always-animating ambient background would
// otherwise keep the GPU busy at full tilt even when nobody's looking. sleep/wake
// are idempotent, so this is safe alongside Phaser's own visibility handling.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.loop.sleep();
  else game.loop.wake();
});

// Debug handle (used by automated tests; harmless in prod).
(window as unknown as { game: Phaser.Game }).game = game;
