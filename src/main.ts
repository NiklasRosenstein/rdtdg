import Phaser from "phaser";

import { GameScene } from "./game/GameScene";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app element not found");
}

new Phaser.Game({
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  autoRound: false,
  antialias: true,
  antialiasGL: true,
  pixelArt: false,
  roundPixels: false,
  parent: app,
  scene: [GameScene]
});
