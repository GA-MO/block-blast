import Phaser from "phaser";
import { ensureTextures } from "../render/textures";
import { ensureIcons } from "../render/icons";
import { ensureFxTextures } from "../render/fxTextures";
import { Economy } from "../systems/economy";
import { getSkin, getTheme } from "../data/themes";
import { Ads } from "../systems/ads";

/** Generates textures for the equipped skin/theme, then opens the Menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const skinId = Economy.getEquippedSkin();
    const themeId = Economy.getEquippedTheme();
    const skin = getSkin(skinId);
    const theme = getTheme(themeId);
    ensureTextures(this, skin.palette, theme.slot, `${skinId}:${themeId}`);
    ensureIcons(this);
    ensureFxTextures(this);
    void Ads.init();
    this.scene.start("Menu");
  }
}
