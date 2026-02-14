import Phaser from "phaser";

import {
  CARD_DEFINITIONS,
  CANNON_FIRE_INTERVAL_TIMESTEPS,
  CANNON_DAMAGE,
  CANNON_RANGE_HEX,
  DRAW_ACTION_COUNT,
  DRAW_ACTION_TIMESTEPS,
  ENEMY_ARCHETYPES,
  ENEMY_STEP_SPEED_MULTIPLIER,
  FIREBALL_DAMAGE,
  FIREBALL_RADIUS_HEX,
  GOO_SLOW_STACKS_PER_APPLICATION,
  GOO_TOWER_FIRE_INTERVAL_TIMESTEPS,
  GOO_TOWER_RANGE_HEX,
  HAND_LIMIT,
  HAND_PANEL_HEIGHT,
  HEX_SIZE,
  SPIKE_DAMAGE,
  START_HAND_DRAW,
  START_LIVES,
  STARTING_DECK_COMPOSITION,
  TOTAL_WAVES,
  WAVE_SPAWN_COUNTS
} from "./config";
import {
  createEnemy,
  createTower,
  createTrap,
  destroyEnemy,
  destroyTower,
  destroyTrap,
  setEnemyPosition,
  syncEnemyHealthBar
} from "./entities";
import { hexCorners, hexKey, hexToPixel, pixelToHex } from "./hex";
import {
  BASE_HEX,
  PATH_HEXES,
  START_HEX,
  createBuildableHexKeySet,
  createMapHexes,
  createPathHexKeySet,
  isInsideMap
} from "./level";
import { CardSystem } from "./systems/CardSystem";
import { CombatSystem, TowerAttack, TrapHit } from "./systems/CombatSystem";
import { TurnSystem } from "./systems/TurnSystem";
import { WaveSystem } from "./systems/WaveSystem";
import { DeckState, Enemy, EnemyType, GamePhase, HandCardView, Hex, HexLayout, Tower, TowerKind, Trap } from "./types";

const HAND_CARD_W = 122;
const HAND_CARD_H = 170;
const INVALID_FLASH_MS = 180;
const TIMESTEP_DURATION_MS = 1000;
const STEP_MOVE_MS = 450;
const STEP_TRAP_MS = 250;
const STEP_TOWER_MS = 250;
const STEP_END_MS = TIMESTEP_DURATION_MS - STEP_MOVE_MS - STEP_TRAP_MS - STEP_TOWER_MS;

export class GameScene extends Phaser.Scene {
  private readonly mapHexes = createMapHexes();
  private readonly pathHexKeys = createPathHexKeySet();
  private readonly buildableHexKeys = createBuildableHexKeySet(this.mapHexes, this.pathHexKeys);
  private readonly occupiedTowerHexKeys = new Set<string>();
  private readonly occupiedTrapHexKeys = new Set<string>();
  private readonly invalidHexFlash = new Map<string, number>();

  private readonly cardSystem = new CardSystem();
  private readonly turnSystem = new TurnSystem();
  private readonly waveSystem = new WaveSystem(WAVE_SPAWN_COUNTS, TOTAL_WAVES);
  private readonly combatSystem = new CombatSystem();

  private layout!: HexLayout;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private panelGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private drawButtonBg!: Phaser.GameObjects.Rectangle;
  private drawButtonLabel!: Phaser.GameObjects.Text;
  private drawPileIcon!: Phaser.GameObjects.Container;
  private drawPileCountText!: Phaser.GameObjects.Text;
  private discardPileIcon!: Phaser.GameObjects.Container;
  private discardPileCountText!: Phaser.GameObjects.Text;

  private restartKey: Phaser.Input.Keyboard.Key | null = null;
  private hoverHex: Hex | null = null;
  private selectedCardId: number | null = null;
  private hoveredHandCardId: number | null = null;

  private deck!: DeckState;
  private lives = START_LIVES;
  private phase: GamePhase = "player_action";

  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private traps: Trap[] = [];
  private handViews: HandCardView[] = [];

  private enemyId = 1;
  private towerId = 1;
  private trapId = 1;
  private enemySpawnCounter = 0;
  private enemyPhaseToken = 0;
  private timestepIndex = 0;
  private handHotkeys: Array<{ key: Phaser.Input.Keyboard.Key; index: number }> = [];
  private readonly textResolution = Math.min(window.devicePixelRatio || 1, 2);
  private readonly onWindowKeyDown = (event: KeyboardEvent): void => {
    if (this.handleDrawHotkey(event)) {
      return;
    }
    this.handleHandHotkey(event);
  };

  constructor() {
    super("game");
  }

  preload(): void {
    this.load.image("card_cannon", "assets/cannon_tower.webp");
    this.load.image("card_fireball", "assets/fireball_spell.webp");
    this.load.image("card_spike", "assets/spike_trap.webp");
    this.load.image("card_goo_tower", "assets/goo_tower.webp");
    this.load.image("card_goo_ball", "assets/gooball.webp");
    this.load.image("enemy_goblin", "assets/enemy_goblin.webp");
    this.load.image("enemy_orc", "assets/enemy_orc.webp");
    this.load.image("enemy_gargoyle", "assets/enemy_gargoyle.webp");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#020617");

    this.layout = this.computeLayout();

    this.boardGraphics = this.add.graphics();
    this.boardGraphics.setDepth(5);

    this.panelGraphics = this.add.graphics();
    this.panelGraphics.setDepth(80);

    this.hudText = this.add.text(14, 10, "", {
      color: "#e2e8f0",
      fontFamily: "monospace",
      fontSize: "15px",
      resolution: this.textResolution
    });
    this.hudText.setDepth(120);

    this.detailText = this.add.text(14, 66, "", {
      color: "#93c5fd",
      fontFamily: "monospace",
      fontSize: "13px",
      resolution: this.textResolution
    });
    this.detailText.setDepth(120);

    this.messageText = this.add.text(this.getViewportWidth() / 2, this.getViewportHeight() / 2 - 20, "", {
      color: "#f8fafc",
      fontFamily: "monospace",
      fontSize: "38px",
      stroke: "#020617",
      strokeThickness: 5,
      align: "center",
      resolution: this.textResolution
    });
    this.messageText.setOrigin(0.5, 0.5);
    this.messageText.setDepth(200);
    this.messageText.setVisible(false);

    this.createDrawButton();
    this.createPileIndicators();

    this.restartKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.R) ?? null;

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.y >= this.getPanelTop()) {
        this.hoverHex = null;
        return;
      }

      const hex = pixelToHex(pointer.x, pointer.y, this.layout);
      this.hoverHex = isInsideMap(hex) ? hex : null;
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handleBoardClick(pointer.x, pointer.y);
    });

    this.setupHandHotkeys();
    this.bindDirectNumberKeyHandlers();
    window.addEventListener("keydown", this.onWindowKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.onWindowKeyDown);
    });

    this.scale.on("resize", this.handleResize, this);
    this.resetRun();
    this.handleResize();
  }

  update(): void {
    this.pollHandHotkeys();
    this.updateHandHoverState();

    if ((this.phase === "victory" || this.phase === "defeat") && this.restartKey) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
        this.resetRun();
      }
    }

    this.renderBoard();
    this.renderHud();
    this.renderPanel();
    this.renderDrawButtonState();
    this.renderPileIndicators();
  }

  private handleResize(): void {
    this.layout = this.computeLayout();

    const buttonX = this.getViewportWidth() - 170;
    const buttonY = 114;

    this.drawButtonBg.setPosition(buttonX, buttonY);
    this.drawButtonLabel.setPosition(buttonX, buttonY);
    this.messageText.setPosition(this.getViewportWidth() / 2, this.getViewportHeight() / 2 - 20);
    this.layoutPileIndicators();

    if (this.deck) {
      this.renderHand();
    }
  }

  private resetRun(): void {
    this.enemyPhaseToken += 1;

    for (const enemy of this.enemies) {
      destroyEnemy(enemy);
    }
    for (const tower of this.towers) {
      destroyTower(tower);
    }
    for (const trap of this.traps) {
      destroyTrap(trap);
    }
    for (const view of this.handViews) {
      view.container.destroy();
      view.hitZone.destroy();
    }

    this.enemies = [];
    this.towers = [];
    this.traps = [];
    this.handViews = [];

    this.enemyId = 1;
    this.towerId = 1;
    this.trapId = 1;
    this.enemySpawnCounter = 0;
    this.timestepIndex = 0;

    this.occupiedTowerHexKeys.clear();
    this.occupiedTrapHexKeys.clear();
    this.invalidHexFlash.clear();

    this.turnSystem.reset();
    this.waveSystem.reset();

    this.phase = "player_action";
    this.lives = START_LIVES;
    this.selectedCardId = null;

    this.deck = this.cardSystem.createStartingDeck(CARD_DEFINITIONS, STARTING_DECK_COMPOSITION, HAND_LIMIT);
    this.cardSystem.drawCards(this.deck, START_HAND_DRAW);

    this.renderHand();
  }

  private computeLayout(): HexLayout {
    const provisional: HexLayout = {
      size: HEX_SIZE,
      originX: 0,
      originY: 0
    };

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const hex of this.mapHexes) {
      const point = hexToPixel(hex, provisional);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return {
      size: HEX_SIZE,
      originX: this.getViewportWidth() * 0.5 - (minX + maxX) / 2,
      originY: this.getBoardCenterY() - (minY + maxY) / 2
    };
  }

  private createDrawButton(): void {
    const x = this.getViewportWidth() - 170;
    const y = 114;

    this.drawButtonBg = this.add.rectangle(x, y, 220, 40, 0x0f766e);
    this.drawButtonBg.setStrokeStyle(2, 0x2dd4bf);
    this.drawButtonBg.setDepth(120);

    this.drawButtonLabel = this.add.text(x, y, this.getDrawButtonLabelText(DRAW_ACTION_COUNT), {
      color: "#ecfeff",
      fontFamily: "monospace",
      fontSize: "14px",
      resolution: this.textResolution
    });
    this.drawButtonLabel.setOrigin(0.5, 0.5);
    this.drawButtonLabel.setDepth(121);

    this.drawButtonBg.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      this.handleDrawAction();
    });
  }

  private createPileIndicators(): void {
    const drawWidget = this.createPileIndicatorWidget("draw");
    this.drawPileIcon = drawWidget.icon;
    this.drawPileCountText = drawWidget.count;

    const discardWidget = this.createPileIndicatorWidget("discard");
    this.discardPileIcon = discardWidget.icon;
    this.discardPileCountText = discardWidget.count;

    this.layoutPileIndicators();
  }

  private createPileIndicatorWidget(kind: "draw" | "discard"): { icon: Phaser.GameObjects.Container; count: Phaser.GameObjects.Text } {
    const backA = this.add.rectangle(-7, -8, 44, 56, 0x0f172a, 0.95);
    backA.setStrokeStyle(1, 0x1e293b);
    const backB = this.add.rectangle(-3, -4, 44, 56, 0x172036, 0.95);
    backB.setStrokeStyle(1, 0x334155);
    const front = this.add.rectangle(0, 0, 44, 56, 0x1e293b, 1);
    front.setStrokeStyle(2, 0x64748b);

    const marker = this.add.graphics();
    if (kind === "draw") {
      marker.lineStyle(2, 0x67e8f9, 1);
      marker.beginPath();
      marker.moveTo(-10, -8);
      marker.lineTo(10, -8);
      marker.moveTo(-10, 0);
      marker.lineTo(10, 0);
      marker.moveTo(-10, 8);
      marker.lineTo(10, 8);
      marker.strokePath();
    } else {
      marker.lineStyle(3, 0xfca5a5, 1);
      marker.beginPath();
      marker.moveTo(-10, -10);
      marker.lineTo(10, 10);
      marker.moveTo(-10, 10);
      marker.lineTo(10, -10);
      marker.strokePath();
    }

    const icon = this.add.container(0, 0, [backA, backB, front, marker]);
    icon.setDepth(121);

    const count = this.add.text(0, 0, "0", {
      color: "#e2e8f0",
      fontFamily: "monospace",
      fontSize: "16px",
      resolution: this.textResolution
    });
    count.setOrigin(0.5, 0.5);
    count.setDepth(121);

    return { icon, count };
  }

  private layoutPileIndicators(): void {
    const panelTop = this.getPanelTop();
    const y = panelTop + 90;
    const drawX = 64;
    const discardX = 136;

    this.drawPileIcon.setPosition(drawX, y - 8);
    this.drawPileCountText.setPosition(drawX, y + 44);

    this.discardPileIcon.setPosition(discardX, y - 8);
    this.discardPileCountText.setPosition(discardX, y + 44);
  }

  private handleDrawAction(): void {
    if (this.phase !== "player_action" || !this.turnSystem.canTakeAction()) {
      return;
    }

    const drawableCount = this.getDrawActionDrawableCount();
    if (drawableCount <= 0) {
      return;
    }

    this.setSelectedCard(null);
    const result = this.cardSystem.drawCards(this.deck, drawableCount);
    if (result.drawn <= 0) {
      this.renderHand();
      return;
    }

    this.renderHand();
    void this.executeEnemyPhase(DRAW_ACTION_TIMESTEPS);
  }

  private handleDrawHotkey(event: KeyboardEvent): boolean {
    if (event.repeat) {
      return false;
    }

    const isSpace = event.code === "Space" || event.key === " " || event.key === "Spacebar";
    if (!isSpace) {
      return false;
    }

    event.preventDefault();
    if (this.phase !== "player_action" || !this.turnSystem.canTakeAction()) {
      return true;
    }

    if (this.getDrawActionDrawableCount() <= 0) {
      return true;
    }

    this.handleDrawAction();
    return true;
  }

  private getDrawActionDrawableCount(): number {
    const remainingHandSpace = Math.max(0, this.deck.handLimit - this.deck.hand.length);
    return Math.min(DRAW_ACTION_COUNT, remainingHandSpace);
  }

  private getDrawButtonLabelText(drawableCount: number): string {
    if (drawableCount <= 0) {
      return "Draw 0 (Hand Full)";
    }

    const stepLabel = DRAW_ACTION_TIMESTEPS === 1 ? "Step" : "Steps";
    return `Draw ${drawableCount} (Enemy +${DRAW_ACTION_TIMESTEPS} ${stepLabel})`;
  }

  private handleHandHotkey(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }

    if (this.phase !== "player_action") {
      return;
    }

    const index = this.keyEventToHandIndex(event);
    if (index === null || index >= this.deck.hand.length) {
      return;
    }

    event.preventDefault();
    this.selectHandIndex(index);
  }

  private keyEventToHandIndex(event: KeyboardEvent): number | null {
    if (event.key.length === 1 && event.key >= "1" && event.key <= "9") {
      return Number(event.key) - 1;
    }

    const code = event.code;
    const digitMatch = /^Digit([1-9])$/.exec(code);
    if (digitMatch) {
      return Number(digitMatch[1]) - 1;
    }

    const numpadMatch = /^Numpad([1-9])$/.exec(code);
    if (numpadMatch) {
      return Number(numpadMatch[1]) - 1;
    }

    return null;
  }

  private setupHandHotkeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    const topRowCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NINE
    ];

    const numpadCodes = [
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_SEVEN,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_NINE
    ];

    this.handHotkeys = [];

    topRowCodes.forEach((code, index) => {
      this.handHotkeys.push({ key: keyboard.addKey(code), index });
    });
    numpadCodes.forEach((code, index) => {
      this.handHotkeys.push({ key: keyboard.addKey(code), index });
    });
  }

  private bindDirectNumberKeyHandlers(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    const keyNames = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"] as const;
    keyNames.forEach((name, index) => {
      keyboard.on(`keydown-${name}`, (event: KeyboardEvent) => {
        if (event.repeat) {
          return;
        }
        if (this.phase !== "player_action") {
          return;
        }
        this.selectHandIndex(index);
      });
    });
  }

  private pollHandHotkeys(): void {
    if (this.phase !== "player_action" || !this.deck) {
      return;
    }

    for (const hotkey of this.handHotkeys) {
      if (!Phaser.Input.Keyboard.JustDown(hotkey.key)) {
        continue;
      }

      this.selectHandIndex(hotkey.index);
      break;
    }
  }

  private selectHandIndex(index: number): void {
    if (!this.deck || index < 0 || index >= this.deck.hand.length) {
      return;
    }
    const card = this.deck.hand[index];
    this.setSelectedCard(card.id);
  }

  private handleBoardClick(worldX: number, worldY: number): void {
    if (Phaser.Geom.Rectangle.Contains(this.drawButtonBg.getBounds(), worldX, worldY)) {
      return;
    }

    if (worldY >= this.getPanelTop() || this.phase !== "player_action") {
      return;
    }

    if (this.selectedCardId === null || !this.turnSystem.canTakeAction()) {
      return;
    }

    const card = this.cardSystem.findHandCard(this.deck, this.selectedCardId);
    if (!card) {
      this.setSelectedCard(null);
      return;
    }

    const targetHex = pixelToHex(worldX, worldY, this.layout);
    if (!isInsideMap(targetHex)) {
      return;
    }

    if (card.type === "fireball") {
      if (!this.hasEnemyOnHex(targetHex)) {
        this.flashInvalidHex(hexKey(targetHex));
        return;
      }

      this.cardSystem.playCard(this.deck, card.id);
      this.setSelectedCard(null);
      this.renderHand();
      void this.animateFireballCardThenEnemyPhase(targetHex, card.timestepCost);
      return;
    }

    if (card.type === "goo_ball") {
      this.cardSystem.playCard(this.deck, card.id);
      this.setSelectedCard(null);
      this.renderHand();
      void this.animateGooBallCardThenEnemyPhase(targetHex, card.timestepCost);
      return;
    }

    let actionApplied = false;
    if (card.type === "cannon_tower") {
      actionApplied = this.tryPlaceTower(targetHex, "cannon");
    } else if (card.type === "goo_tower") {
      actionApplied = this.tryPlaceTower(targetHex, "goo");
    } else if (card.type === "spike_trap") {
      actionApplied = this.tryPlaceTrap(targetHex);
    }

    if (!actionApplied) {
      this.flashInvalidHex(hexKey(targetHex));
      return;
    }

    this.cardSystem.playCard(this.deck, card.id);
    this.setSelectedCard(null);
    this.renderHand();

    void this.executeEnemyPhase(card.timestepCost);
  }

  private tryPlaceTower(targetHex: Hex, kind: TowerKind): boolean {
    const key = hexKey(targetHex);
    if (!this.buildableHexKeys.has(key) || this.occupiedTowerHexKeys.has(key)) {
      return false;
    }

    const pos = hexToPixel(targetHex, this.layout);
    const rangeHex = kind === "goo" ? GOO_TOWER_RANGE_HEX : CANNON_RANGE_HEX;
    const damage = kind === "goo" ? 0 : CANNON_DAMAGE;
    const fireIntervalTimesteps = kind === "goo" ? GOO_TOWER_FIRE_INTERVAL_TIMESTEPS : CANNON_FIRE_INTERVAL_TIMESTEPS;
    const tower = createTower(
      this,
      this.towerId,
      kind,
      targetHex,
      pos.x,
      pos.y,
      rangeHex,
      damage,
      fireIntervalTimesteps,
      this.timestepIndex + fireIntervalTimesteps
    );
    this.towerId += 1;

    this.towers.push(tower);
    this.occupiedTowerHexKeys.add(key);
    return true;
  }

  private tryPlaceTrap(targetHex: Hex): boolean {
    const key = hexKey(targetHex);
    if (!this.pathHexKeys.has(key) || this.occupiedTrapHexKeys.has(key) || key === hexKey(BASE_HEX) || key === hexKey(START_HEX)) {
      return false;
    }

    const pos = hexToPixel(targetHex, this.layout);
    const trap = createTrap(this, this.trapId, targetHex, pos.x, pos.y, SPIKE_DAMAGE);
    this.trapId += 1;

    this.traps.push(trap);
    this.occupiedTrapHexKeys.add(key);
    return true;
  }

  private hasEnemyOnHex(targetHex: Hex): boolean {
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const enemyHex = PATH_HEXES[Math.max(0, Math.min(PATH_HEXES.length - 1, enemy.pathIndex))];
      if (enemyHex.q === targetHex.q && enemyHex.r === targetHex.r) {
        return true;
      }
    }

    return false;
  }

  private async executeEnemyPhase(enemySubsteps: number): Promise<void> {
    if (!this.turnSystem.startAction(enemySubsteps)) {
      return;
    }

    this.phase = "enemy_step";
    const token = ++this.enemyPhaseToken;

    while (token === this.enemyPhaseToken && this.turnSystem.consumeEnemySubstep()) {
      const shouldContinue = await this.executeEnemySubstepAnimated(token);
      if (!shouldContinue) {
        break;
      }
    }

    if (token !== this.enemyPhaseToken) {
      return;
    }

    if (this.phase === "enemy_step") {
      this.turnSystem.finishEnemyPhase();
      this.phase = "player_action";
    }
  }

  private async executeEnemySubstepAnimated(token: number): Promise<boolean> {
    this.timestepIndex += 1;

    const spawned: Enemy[] = [];
    this.waveSystem.spawnEnemyForSubstep(() => {
      spawned.push(this.spawnEnemyByWave());
    });

    const trapHitPairsThisTimestep = new Set<string>();
    await this.animateEnemyMovementStep(spawned, token, trapHitPairsThisTimestep);
    if (token !== this.enemyPhaseToken) {
      return false;
    }

    if (this.phase === "defeat") {
      return false;
    }

    const towerShots = this.combatSystem.resolveTowers(
      this.enemies,
      this.towers,
      PATH_HEXES,
      this.timestepIndex,
      GOO_SLOW_STACKS_PER_APPLICATION
    );
    this.syncEnemyVisuals();
    await this.animateTowerShots(towerShots, token);
    if (token !== this.enemyPhaseToken) {
      return false;
    }

    this.cleanupDefeatedEnemies();
    this.decayEnemySlowStacks();

    const waveResult = this.waveSystem.tryAdvanceIfCleared(this.countAliveEnemies());
    if (waveResult === "victory") {
      this.phase = "victory";
      return false;
    }

    await this.wait(STEP_END_MS);
    return token === this.enemyPhaseToken;
  }

  private spawnEnemyByWave(): Enemy {
    const archetype = ENEMY_ARCHETYPES[this.pickEnemyType()];
    const pos = hexToPixel(START_HEX, this.layout);
    const enemy = createEnemy(this, this.enemyId, archetype, pos.x, pos.y);
    this.enemyId += 1;
    this.enemySpawnCounter += 1;

    this.enemies.push(enemy);
    return enemy;
  }

  private pickEnemyType(): EnemyType {
    const wave = this.waveSystem.getWaveNumber();
    const idx = this.enemySpawnCounter;

    if (wave <= 1) {
      return "goblin";
    }

    if (wave === 2) {
      const pattern: EnemyType[] = ["goblin", "gargoyle", "goblin", "orc"];
      return pattern[idx % pattern.length];
    }

    if (wave === 3) {
      const pattern: EnemyType[] = ["goblin", "gargoyle", "orc", "goblin", "gargoyle"];
      return pattern[idx % pattern.length];
    }

    const pattern: EnemyType[] = ["orc", "gargoyle", "goblin", "orc", "gargoyle", "goblin"];
    return pattern[idx % pattern.length];
  }

  private async animateFireballCardThenEnemyPhase(targetHex: Hex, timestepCost: number): Promise<void> {
    const token = ++this.enemyPhaseToken;
    this.phase = "enemy_step";

    await this.animateFireballImpact(targetHex, token);
    if (token !== this.enemyPhaseToken || this.isTerminalPhase()) {
      return;
    }

    await this.executeEnemyPhase(timestepCost);
  }

  private async animateGooBallCardThenEnemyPhase(targetHex: Hex, timestepCost: number): Promise<void> {
    const token = ++this.enemyPhaseToken;
    this.phase = "enemy_step";

    await this.animateGooBallImpact(targetHex, token);
    if (token !== this.enemyPhaseToken || this.isTerminalPhase()) {
      return;
    }

    await this.executeEnemyPhase(timestepCost);
  }

  private async animateFireballImpact(targetHex: Hex, token: number): Promise<void> {
    const impact = hexToPixel(targetHex, this.layout);

    const projectile = this.add.circle(impact.x, impact.y - 120, 10, 0xfb923c, 1);
    projectile.setDepth(170);

    await this.tweenPromise({
      targets: projectile,
      y: impact.y,
      ease: "Quad.easeIn",
      duration: 260
    });

    if (token !== this.enemyPhaseToken) {
      projectile.destroy();
      return;
    }

    projectile.destroy();

    const shockwave = this.add.circle(impact.x, impact.y, 12, 0xf97316, 0.6);
    shockwave.setDepth(168);
    this.tweens.add({
      targets: shockwave,
      radius: HEX_SIZE * 2.1,
      alpha: 0,
      ease: "Sine.easeOut",
      duration: 220,
      onComplete: () => shockwave.destroy()
    });

    const hits = this.combatSystem.applyFireball(this.enemies, PATH_HEXES, targetHex, FIREBALL_RADIUS_HEX, FIREBALL_DAMAGE);
    for (const hit of hits) {
      this.flashEnemy(hit.enemy, 0xfb7185, 180);
    }

    this.syncEnemyVisuals();
    this.cleanupDefeatedEnemies();

    const waveResult = this.waveSystem.tryAdvanceIfCleared(this.countAliveEnemies());
    if (waveResult === "victory") {
      this.phase = "victory";
    }

    await this.wait(120);
  }

  private async animateGooBallImpact(targetHex: Hex, token: number): Promise<void> {
    const impact = hexToPixel(targetHex, this.layout);

    const projectile = this.add.circle(impact.x, impact.y - 120, 10, 0x34d399, 1);
    projectile.setDepth(170);

    await this.tweenPromise({
      targets: projectile,
      y: impact.y,
      ease: "Quad.easeIn",
      duration: 260
    });

    if (token !== this.enemyPhaseToken) {
      projectile.destroy();
      return;
    }

    projectile.destroy();

    const shockwave = this.add.circle(impact.x, impact.y, 14, 0x10b981, 0.5);
    shockwave.setDepth(168);
    this.tweens.add({
      targets: shockwave,
      radius: HEX_SIZE * 2.5,
      alpha: 0,
      ease: "Sine.easeOut",
      duration: 260,
      onComplete: () => shockwave.destroy()
    });

    const affected = this.combatSystem.applyGlobalSlow(this.enemies, GOO_SLOW_STACKS_PER_APPLICATION);
    for (const enemy of affected) {
      this.flashEnemy(enemy, 0x4ade80, 180);
    }

    await this.wait(120);
  }

  private async animateEnemyMovementStep(
    spawned: Enemy[],
    token: number,
    trapHitPairsThisTimestep: Set<string>
  ): Promise<void> {
    for (const enemy of spawned) {
      enemy.sprite.setAlpha(0);
      enemy.sprite.setScale(enemy.spriteScale * 0.55);
      enemy.hpBg.setAlpha(0);
      enemy.hpFill.setAlpha(0);
      this.tweens.add({
        targets: [enemy.sprite],
        alpha: 1,
        scale: enemy.spriteScale,
        duration: 220,
        ease: "Back.easeOut"
      });
      this.tweens.add({
        targets: [enemy.hpBg, enemy.hpFill],
        alpha: 1,
        duration: 180,
        ease: "Sine.easeOut"
      });
    }

    const tilesToMove = new Map<number, number>();
    let maxTiles = 0;

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const baseTiles = enemy.moveTilesPerStep * ENEMY_STEP_SPEED_MULTIPLIER;
      const tiles = Math.max(1, baseTiles - enemy.slowStacks);
      tilesToMove.set(enemy.id, tiles);
      maxTiles = Math.max(maxTiles, tiles);
    }

    if (maxTiles === 0) {
      return;
    }

    const moveAndTrapBudget = STEP_MOVE_MS + STEP_TRAP_MS;
    const perTileBudget = Math.max(30, Math.floor(moveAndTrapBudget / maxTiles));
    const movementPromises: Array<Promise<void>> = [];
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const tiles = tilesToMove.get(enemy.id) ?? 0;
      if (tiles <= 0) {
        continue;
      }

      const targetPathIndex = Math.min(enemy.pathIndex + tiles, PATH_HEXES.length - 1);
      movementPromises.push(
        this.tweenEnemyAlongPath(enemy, enemy.pathIndex, targetPathIndex, moveAndTrapBudget)
      );
    }

    for (let tileStep = 0; tileStep < maxTiles; tileStep += 1) {
      const reachedBase: Enemy[] = [];
      await this.wait(perTileBudget);
      if (token !== this.enemyPhaseToken) {
        return;
      }

      for (const enemy of this.enemies) {
        if (!enemy.alive) {
          continue;
        }

        const remainingTiles = tilesToMove.get(enemy.id) ?? 0;
        if (remainingTiles <= 0) {
          continue;
        }

        tilesToMove.set(enemy.id, remainingTiles - 1);

        const nextPathIndex = enemy.pathIndex + 1;
        enemy.pathIndex = Math.min(nextPathIndex, PATH_HEXES.length - 1);

        if (nextPathIndex >= PATH_HEXES.length - 1) {
          reachedBase.push(enemy);
        }
      }

      if (reachedBase.length > 0) {
        this.lives -= reachedBase.length;
        for (const enemy of reachedBase) {
          enemy.alive = false;
          enemy.sprite.setVisible(false);
          enemy.hpBg.setVisible(false);
          enemy.hpFill.setVisible(false);
        }

        if (this.lives <= 0) {
          this.lives = 0;
          this.phase = "defeat";
        }
      }

      if (this.phase === "defeat") {
        return;
      }

      const trapHits = this.combatSystem.resolveTraps(this.enemies, this.traps, PATH_HEXES, trapHitPairsThisTimestep);
      this.syncEnemyHealthBarsOnly();
      this.playTrapHitEffects(trapHits, Math.max(80, perTileBudget));
      for (const enemy of this.enemies) {
        if (!enemy.alive) {
          enemy.sprite.setVisible(false);
          enemy.hpBg.setVisible(false);
          enemy.hpFill.setVisible(false);
        }
      }
      if (token !== this.enemyPhaseToken) {
        return;
      }
    }

    await Promise.all(movementPromises);
    if (token !== this.enemyPhaseToken) {
      return;
    }

    this.syncEnemyVisuals();
    this.cleanupDefeatedEnemies();
  }

  private playTrapHitEffects(hits: TrapHit[], durationMs: number): void {
    if (hits.length > 0) {
      const triggeredTrapIds = new Set<number>();
      for (const hit of hits) {
        triggeredTrapIds.add(hit.trap.id);
        this.flashEnemy(hit.enemy, 0xf87171, 150);
      }

      for (const trap of this.traps) {
        if (!triggeredTrapIds.has(trap.id)) {
          continue;
        }

        this.tweens.add({
          targets: trap.sprite,
          scaleX: 1.2,
          scaleY: 1.2,
          yoyo: true,
          duration: Math.max(40, durationMs * 0.5)
        });
      }
    }
  }

  private async animateTowerShots(shots: TowerAttack[], token: number): Promise<void> {
    if (shots.length > 0) {
      const beamGraphics = this.add.graphics();
      beamGraphics.setDepth(165);
      let hasCannonShot = false;

      for (const shot of shots) {
        this.tweens.add({
          targets: shot.tower.sprite,
          scaleX: 1.12,
          scaleY: 1.12,
          yoyo: true,
          duration: STEP_TOWER_MS * 0.45
        });

        if (shot.kind === "cannon") {
          hasCannonShot = true;
          beamGraphics.lineStyle(2, 0xfde68a, 0.95);
          beamGraphics.beginPath();
          beamGraphics.moveTo(shot.tower.sprite.x, shot.tower.sprite.y);
          beamGraphics.lineTo(shot.target.sprite.x, shot.target.sprite.y);
          beamGraphics.strokePath();
          this.flashEnemy(shot.target, 0xfacc15, 140);
          continue;
        }

        const impact = hexToPixel(shot.targetHex, this.layout);
        const gooProjectile = this.add.circle(shot.tower.sprite.x, shot.tower.sprite.y, 5, 0x34d399, 1);
        gooProjectile.setDepth(166);
        this.tweens.add({
          targets: gooProjectile,
          x: impact.x,
          y: impact.y,
          ease: "Quad.easeInOut",
          duration: STEP_TOWER_MS * 0.55,
          onComplete: () => {
            gooProjectile.destroy();
            const splash = this.add.circle(impact.x, impact.y, 10, 0x34d399, 0.35);
            splash.setDepth(166);
            this.tweens.add({
              targets: splash,
              radius: HEX_SIZE * 0.8,
              alpha: 0,
              duration: STEP_TOWER_MS * 0.45,
              onComplete: () => splash.destroy()
            });
          }
        });

        for (const enemy of shot.affectedEnemies) {
          this.flashEnemy(enemy, 0x4ade80, 160);
        }
      }

      if (hasCannonShot) {
        this.tweens.add({
          targets: beamGraphics,
          alpha: 0,
          duration: STEP_TOWER_MS * 0.7,
          onComplete: () => beamGraphics.destroy()
        });
      } else {
        beamGraphics.destroy();
      }
    }

    await this.wait(STEP_TOWER_MS);
    if (token !== this.enemyPhaseToken) {
      return;
    }

    this.syncEnemyVisuals();
    this.cleanupDefeatedEnemies();
  }

  private decayEnemySlowStacks(): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.slowStacks <= 0) {
        continue;
      }
      enemy.slowStacks = Math.max(0, enemy.slowStacks - 1);
    }
  }

  private flashEnemy(enemy: Enemy, tint: number, durationMs: number): void {
    enemy.sprite.setTint(tint);
    this.time.delayedCall(durationMs, () => {
      if (!enemy.alive) {
        return;
      }
      enemy.sprite.clearTint();
    });
  }

  private wait(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }

  private tweenPromise(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({
        ...config,
        onComplete: () => resolve()
      });
    });
  }

  private tweenEnemyAlongPath(enemy: Enemy, fromPathIndex: number, toPathIndex: number, durationMs: number): Promise<void> {
    const tracker = { progress: 0 };
    const totalTiles = Math.max(1, toPathIndex - fromPathIndex);

    return this.tweenPromise({
      targets: tracker,
      progress: totalTiles,
      ease: "Linear",
      duration: durationMs,
      onUpdate: () => {
        if (!enemy.alive) {
          return;
        }

        const clamped = Phaser.Math.Clamp(tracker.progress, 0, totalTiles);
        const segmentOffset = Math.floor(clamped);
        const segmentT = clamped - segmentOffset;

        const segmentStartIndex = Math.min(fromPathIndex + segmentOffset, PATH_HEXES.length - 1);
        const segmentEndIndex = Math.min(segmentStartIndex + 1, PATH_HEXES.length - 1);

        const from = hexToPixel(PATH_HEXES[segmentStartIndex], this.layout);
        const to = hexToPixel(PATH_HEXES[segmentEndIndex], this.layout);

        const x = Phaser.Math.Linear(from.x, to.x, segmentT);
        const y = Phaser.Math.Linear(from.y, to.y, segmentT);
        setEnemyPosition(enemy, x, y);
      }
    });
  }

  private isTerminalPhase(): boolean {
    return this.phase === "defeat" || this.phase === "victory";
  }

  private syncEnemyHealthBarsOnly(): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }
      syncEnemyHealthBar(enemy);
    }
  }

  private syncEnemyVisuals(): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const pathIndex = Math.max(0, Math.min(PATH_HEXES.length - 1, enemy.pathIndex));
      const pos = hexToPixel(PATH_HEXES[pathIndex], this.layout);
      setEnemyPosition(enemy, pos.x, pos.y);
      syncEnemyHealthBar(enemy);
    }
  }

  private cleanupDefeatedEnemies(): void {
    const alive: Enemy[] = [];

    for (const enemy of this.enemies) {
      if (enemy.alive) {
        alive.push(enemy);
      } else {
        destroyEnemy(enemy);
      }
    }

    this.enemies = alive;
  }

  private countAliveEnemies(): number {
    let count = 0;
    for (const enemy of this.enemies) {
      if (enemy.alive) {
        count += 1;
      }
    }
    return count;
  }

  private flashInvalidHex(key: string): void {
    this.invalidHexFlash.set(key, this.time.now + INVALID_FLASH_MS);
  }

  private renderBoard(): void {
    const g = this.boardGraphics;
    g.clear();

    const now = this.time.now;

    for (const hex of this.mapHexes) {
      const key = hexKey(hex);
      const points = hexCorners(hex, this.layout);
      const isPath = this.pathHexKeys.has(key);
      const isBuildable = this.buildableHexKeys.has(key);
      const isHovered = this.hoverHex !== null && this.hoverHex.q === hex.q && this.hoverHex.r === hex.r;
      const invalid = (this.invalidHexFlash.get(key) ?? 0) > now;
      const isBase = key === hexKey(BASE_HEX);

      let fill = 0x111827;
      let line = 0x1f2937;

      if (isBuildable) {
        fill = 0x172554;
      }

      if (isPath) {
        fill = 0x374151;
      }

      if (isBase) {
        fill = 0x1d4ed8;
      }

      if (this.occupiedTowerHexKeys.has(key)) {
        fill = 0x7c2d12;
      }

      if (this.occupiedTrapHexKeys.has(key)) {
        fill = 0x7f1d1d;
      }

      if (isHovered && this.phase === "player_action") {
        line = 0xe2e8f0;
      }

      if (invalid) {
        fill = 0x7f1d1d;
        line = 0xfca5a5;
      }

      g.fillStyle(fill, 1);
      g.lineStyle(1, line, 1);
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        g.lineTo(points[i].x, points[i].y);
      }
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
  }

  private renderPanel(): void {
    this.panelGraphics.clear();

    const panelTop = this.getPanelTop();
    this.panelGraphics.fillStyle(0x0b1120, 0.95);
    this.panelGraphics.fillRect(0, panelTop, this.getViewportWidth(), this.getHandPanelHeight());

    this.panelGraphics.lineStyle(2, 0x1e293b, 1);
    this.panelGraphics.beginPath();
    this.panelGraphics.moveTo(0, panelTop);
    this.panelGraphics.lineTo(this.getViewportWidth(), panelTop);
    this.panelGraphics.strokePath();
  }

  private renderHud(): void {
    const turn = this.turnSystem.getState().turnNumber;
    this.messageText.setPosition(this.getViewportWidth() / 2, this.getViewportHeight() / 2 - 20);

    let phaseLabel = "Player Action";
    if (this.phase === "enemy_step") {
      phaseLabel = "Enemy Step";
    } else if (this.phase === "victory") {
      phaseLabel = "Victory";
    } else if (this.phase === "defeat") {
      phaseLabel = "Defeat";
    }

    this.hudText.setText(
      `Lives: ${this.lives}    Wave: ${this.waveSystem.getWaveNumber()}/${this.waveSystem.getTotalWaves()}    ` +
        `Turn: ${turn}    Phase: ${phaseLabel}\n` +
        `Enemies: ${this.countAliveEnemies()}    Deck: ${this.deck.drawPile.length}    Hand: ${this.deck.hand.length}    Discard: ${this.deck.discardPile.length}`
    );

    if (this.selectedCardId === null) {
      this.detailText.setText("Select a card in hand. Action: play one card OR draw cards (enemy +1 step).");
    } else {
      const card = this.cardSystem.findHandCard(this.deck, this.selectedCardId);
      if (card) {
        let ruleText = "";
        if (card.type === "cannon_tower") {
          ruleText = "Place on buildable hex.";
        } else if (card.type === "goo_tower") {
          ruleText = "Place on buildable hex. Fires every 2 timesteps and applies slow on target hex.";
        } else if (card.type === "spike_trap") {
          ruleText = "Place on path hex.";
        } else if (card.type === "fireball") {
          ruleText = "Cast on hex with enemy.";
        } else if (card.type === "goo_ball") {
          ruleText = "Cast on any board hex to apply global slow.";
        }
        this.detailText.setText(`Selected: ${card.name} (Enemy +${card.timestepCost} steps). ${ruleText}`);
      } else {
        this.detailText.setText("Select a card in hand.");
      }
    }

    if (this.phase === "victory") {
      this.messageText.setText("You Survived All Waves\nPress R to Restart");
      this.messageText.setVisible(true);
    } else if (this.phase === "defeat") {
      this.messageText.setText("Defeat\nPress R to Restart");
      this.messageText.setVisible(true);
    } else {
      this.messageText.setVisible(false);
    }
  }

  private renderDrawButtonState(): void {
    const drawableCount = this.getDrawActionDrawableCount();
    const actionable = this.phase === "player_action" && this.turnSystem.canTakeAction() && drawableCount > 0;
    this.drawButtonBg.setFillStyle(actionable ? 0x0f766e : 0x334155);
    this.drawButtonBg.setStrokeStyle(2, actionable ? 0x2dd4bf : 0x64748b);
    this.drawButtonLabel.setText(this.getDrawButtonLabelText(drawableCount));
    this.drawButtonLabel.setColor(actionable ? "#ecfeff" : "#cbd5e1");

    if (actionable) {
      if (!this.drawButtonBg.input || !this.drawButtonBg.input.enabled) {
        this.drawButtonBg.setInteractive({ useHandCursor: true });
      }
    } else if (this.drawButtonBg.input && this.drawButtonBg.input.enabled) {
      this.drawButtonBg.disableInteractive();
    }
  }

  private renderPileIndicators(): void {
    this.drawPileCountText.setText(`${this.deck.drawPile.length}`);
    this.discardPileCountText.setText(`${this.deck.discardPile.length}`);
  }

  private renderHand(): void {
    for (const view of this.handViews) {
      view.container.destroy();
      view.hitZone.destroy();
    }
    this.handViews = [];
    this.hoveredHandCardId = null;

    const panelTop = this.getPanelTop();
    const centerX = this.getViewportWidth() / 2;
    const baseY = panelTop + 96;

    this.deck.hand.forEach((card) => {
      const x = centerX;
      const y = baseY;

      const art = this.add.image(0, 0, card.artKey);
      const maxArtWidth = HAND_CARD_W;
      const maxArtHeight = HAND_CARD_H;
      const artScale = Math.min(maxArtWidth / art.width, maxArtHeight / art.height);
      art.setDisplaySize(art.width * artScale, art.height * artScale);

      const container = this.add.container(x, y, [art]);
      container.setSize(art.displayWidth, art.displayHeight);
      container.setDepth(130);
      const hitZone = this.add.zone(x, y, art.displayWidth + 10, art.displayHeight + 10);
      hitZone.setOrigin(0.5, 0.5);
      hitZone.setDepth(131);
      hitZone.setInteractive({ useHandCursor: true });

      hitZone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();

        if (this.phase !== "player_action" || !this.turnSystem.canTakeAction()) {
          return;
        }

        this.setSelectedCard(this.selectedCardId === card.id ? null : card.id);
      });

      this.handViews.push({
        cardId: card.id,
        container,
        art,
        hitZone
      });
    });

    this.applyHandFanLayout(false);
    this.syncHandSelectionStyles();
    this.updateHandHoverState();
  }

  private setSelectedCard(cardId: number | null): void {
    this.selectedCardId = cardId;
    this.syncHandSelectionStyles();
    this.updateHandHoverState();
  }

  private getViewportWidth(): number {
    return this.scale.width;
  }

  private getViewportHeight(): number {
    return this.scale.height;
  }

  private getHandPanelHeight(): number {
    const dynamicHeight = Math.round(this.getViewportHeight() * 0.25);
    return Phaser.Math.Clamp(dynamicHeight, 140, HAND_PANEL_HEIGHT);
  }

  private getPanelTop(): number {
    return this.getViewportHeight() - this.getHandPanelHeight();
  }

  private getBoardCenterY(): number {
    return this.getPanelTop() * 0.46;
  }

  private syncHandSelectionStyles(): void {
    for (const view of this.handViews) {
      const selected = this.selectedCardId === view.cardId;
      view.art.setTint(selected ? 0xffffff : 0xd8e3ff);
      view.container.setAlpha(selected ? 1 : 0.9);
    }
  }

  private updateHandHoverState(): void {
    if (this.handViews.length === 0) {
      if (this.hoveredHandCardId !== null) {
        this.hoveredHandCardId = null;
      }
      return;
    }

    const pointer = this.input.activePointer;
    const pointerX = pointer.worldX;
    const pointerY = pointer.worldY;
    let hoveredCardId: number | null = null;

    for (let i = this.handViews.length - 1; i >= 0; i -= 1) {
      const view = this.handViews[i];
      const bounds = view.hitZone.getBounds();
      if (Phaser.Geom.Rectangle.Contains(bounds, pointerX, pointerY)) {
        hoveredCardId = view.cardId;
        break;
      }
    }

    if (hoveredCardId === null && this.selectedCardId !== null) {
      const selectedInHand = this.handViews.some((view) => view.cardId === this.selectedCardId);
      if (selectedInHand) {
        hoveredCardId = this.selectedCardId;
      }
    }

    if (hoveredCardId === this.hoveredHandCardId) {
      return;
    }

    this.hoveredHandCardId = hoveredCardId;
    this.applyHandFanLayout(true);
  }

  private applyHandFanLayout(animated: boolean): void {
    const count = this.handViews.length;
    if (count === 0) {
      return;
    }

    const centerX = this.getViewportWidth() / 2;
    const panelTop = this.getPanelTop();
    const baseY = panelTop + 96;
    const maxSpan = this.getViewportWidth() - 120;
    const cardSpan = Math.min(maxSpan, Math.max(HAND_CARD_W + 20, count * 92));
    const hoverIndex = this.getHoveredHandIndex();

    this.handViews.forEach((view, index) => {
      const t = count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
      let x = centerX + t * cardSpan * 0.5;
      let y = baseY + Math.pow(Math.abs(t), 1.6) * 24;
      let rotation = t * 0.19;
      let scaleX = 1;
      let scaleY = 1;
      let depth = 130 + index;

      if (hoverIndex !== -1) {
        if (index === hoverIndex) {
          y -= 22;
          rotation *= 0.35;
          scaleX = 1.05;
          scaleY = 1.05;
          depth = 190;
        } else {
          const direction = index < hoverIndex ? -1 : 1;
          const distance = Math.abs(index - hoverIndex);
          x += direction * Math.max(8, 18 - distance * 4);
          y += Math.min(8, distance * 2);
        }
      }

      if (animated) {
        this.tweens.killTweensOf(view.container);
        this.tweens.killTweensOf(view.hitZone);

        this.tweens.add({
          targets: view.container,
          x,
          y,
          rotation,
          scaleX,
          scaleY,
          ease: "Cubic.easeOut",
          duration: 180
        });
        this.tweens.add({
          targets: view.hitZone,
          x,
          y,
          ease: "Cubic.easeOut",
          duration: 180
        });
      } else {
        view.container.setPosition(x, y);
        view.container.setRotation(rotation);
        view.container.setScale(scaleX, scaleY);
        view.hitZone.setPosition(x, y);
      }

      view.container.setDepth(depth);
      view.hitZone.setDepth(depth + 1);
    });
  }

  private getHoveredHandIndex(): number {
    if (this.hoveredHandCardId === null) {
      return -1;
    }
    return this.handViews.findIndex((view) => view.cardId === this.hoveredHandCardId);
  }
}
