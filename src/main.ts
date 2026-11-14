import Phaser from 'phaser';
import { FieldScene } from './scenes/FieldScene';
import { setupFeelPanel } from './debug/feelPanel';
import { addSaveControls } from './debug/saveControls';
import { startSaveSession } from './save/saveSession';

// Load any saved feel tweaks before the game starts, and add the ⚙ panel.
const feelPanel = setupFeelPanel();

// Open (or create) the save, then add the Export/Import buttons to the ⚙ panel.
void startSaveSession().then(() => addSaveControls(feelPanel.panel, feelPanel.flash));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14202b',
  scale: {
    mode: Phaser.Scale.RESIZE, // fill the whole screen, whatever the phone's shape
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: { antialias: true },
  input: { activePointers: 3 }, // two thumbs + one spare
  scene: [FieldScene],
});

// Pause the game while the phone is held upright (the "Rotate your phone" screen shows).
const portrait = window.matchMedia('(orientation: portrait)');
const applyOrientation = () => {
  if (portrait.matches) game.loop.sleep();
  else game.loop.wake();
};
portrait.addEventListener('change', applyOrientation);
applyOrientation();
