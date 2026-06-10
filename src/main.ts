import Phaser from "phaser";
import { DESIGN, THEME } from "./config";
import { BootScene } from "./scenes/BootScene";
import MenuScene from "./scenes/MenuScene";
import { GameScene } from "./scenes/GameScene";
import ShopScene from "./scenes/ShopScene";
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
  render: { antialias: true, roundPixels: true, powerPreference: "high-performance" },
  // 3 touch pointers: a stray second finger resting on the screen must not
  // steal or cancel the active drag (with 1, dragging intermittently fails).
  input: { activePointers: 3 },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, GameScene, ShopScene, LevelSelectScene],
});

// Debug handle (used by automated tests; harmless in prod).
(window as unknown as { game: Phaser.Game }).game = game;
