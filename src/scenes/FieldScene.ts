import Phaser from 'phaser';
import { feel } from '../config/feel';
import { END_ZONE_DEPTH, FIELD_WIDTH, TOTAL_LENGTH, yardLineNumber } from '../sim/field';
import { FEEL_CHANGE_EVENT } from '../debug/feelPanel';

// Placeholder colours only. The real art comes in stage 13.
const COLORS = {
  turf: 0x2f6b4f,
  turfAlt: 0x2a6247,
  endZone: 0x1f4d63,
  line: 0xf4efe1,
  tapRing: 0xffd166,
};

/** Draws the field in "yard" units; the camera zoom turns yards into screen pixels. */
export class FieldScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;

  constructor() {
    super('field');
  }

  create() {
    this.drawField();

    this.label = this.add
      .text(0, 0, 'Tap anywhere, drag to scroll, ⚙ = feel panel', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f4efe1',
        backgroundColor: '#14202bcc',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());

    // Re-fit when a feel value changes in the tuning panel.
    const onFeelChange = () => this.fitCamera();
    window.addEventListener(FEEL_CHANGE_EVENT, onFeelChange);
    this.events.once('shutdown', () => window.removeEventListener(FEEL_CHANGE_EVENT, onFeelChange));

    // Start looking at our own 25-yard line, like a drive start.
    this.cameras.main.centerOn(END_ZONE_DEPTH + 25, FIELD_WIDTH / 2);

    // Touch test: a ring appears wherever you tap. Drag sideways to scroll the field.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.showTapRing(p.worldX, p.worldY));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
    });
  }

  /** Zoom so the full width of the field (sideline to sideline) fits the screen height. */
  private fitCamera() {
    const cam = this.cameras.main;
    const m = feel.camera.sidelineMarginYards;
    cam.setZoom(this.scale.height / (FIELD_WIDTH + m * 2));
    cam.setBounds(-m, -m, TOTAL_LENGTH + m * 2, FIELD_WIDTH + m * 2);

    // Keep the on-screen label at normal size in the top-left, whatever the zoom.
    // (Scroll-fixed objects are still scaled around the screen centre by camera zoom.)
    const z = cam.zoom;
    this.label.setScale(1 / z);
    this.label.setPosition(
      cam.width / 2 - cam.width / 2 / z + 8 / z,
      cam.height / 2 - cam.height / 2 / z + 8 / z,
    );
  }

  private drawField() {
    const g = this.add.graphics();

    // Turf stripes every 5 yards, then the two end zones.
    for (let x = END_ZONE_DEPTH; x < TOTAL_LENGTH - END_ZONE_DEPTH; x += 5) {
      g.fillStyle((x / 5) % 2 === 0 ? COLORS.turf : COLORS.turfAlt);
      g.fillRect(x, 0, 5, FIELD_WIDTH);
    }
    g.fillStyle(COLORS.endZone);
    g.fillRect(0, 0, END_ZONE_DEPTH, FIELD_WIDTH);
    g.fillRect(TOTAL_LENGTH - END_ZONE_DEPTH, 0, END_ZONE_DEPTH, FIELD_WIDTH);

    // Yard lines every 5 yards, thicker goal lines, and the outer border.
    for (let x = END_ZONE_DEPTH; x <= TOTAL_LENGTH - END_ZONE_DEPTH; x += 5) {
      const isGoal = x === END_ZONE_DEPTH || x === TOTAL_LENGTH - END_ZONE_DEPTH;
      g.fillStyle(COLORS.line, isGoal ? 1 : 0.6);
      g.fillRect(x - 0.1, 0, isGoal ? 0.35 : 0.2, FIELD_WIDTH);
    }
    g.lineStyle(0.3, COLORS.line, 1);
    g.strokeRect(0, 0, TOTAL_LENGTH, FIELD_WIDTH);

    // Yard numbers, drawn big and then shrunk down so they stay sharp.
    for (let x = 0; x <= TOTAL_LENGTH; x += 10) {
      const n = yardLineNumber(x);
      if (n === null) continue;
      for (const y of [FIELD_WIDTH * 0.2, FIELD_WIDTH * 0.8]) {
        this.add
          .text(x, y, String(n), { fontFamily: 'monospace', fontSize: '64px', color: '#f4efe1' })
          .setOrigin(0.5)
          .setAlpha(0.5)
          .setScale(3 / 64);
      }
    }
  }

  private showTapRing(x: number, y: number) {
    const ring = this.add.circle(x, y, 1.2).setStrokeStyle(0.25, COLORS.tapRing).setDepth(5);
    this.tweens.add({
      targets: ring,
      scale: 2,
      alpha: 0,
      duration: feel.juice.tapRingTime * 1000,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
}
