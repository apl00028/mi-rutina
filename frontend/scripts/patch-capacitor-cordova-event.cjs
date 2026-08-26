const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capacitor',
  'android',
  'capacitor',
  'src',
  'main',
  'java',
  'com',
  'getcapacitor',
  'cordova',
  'MockCordovaWebViewImpl.java'
);

const original =
  `        eval("window.Capacitor.triggerEvent('" + eventName + "', 'document');", (s) -> {});`;

const patched =
  `        eval("if (window.Capacitor && typeof window.Capacitor.triggerEvent === 'function') { window.Capacitor.triggerEvent('" + eventName + "', 'document'); }", (s) -> {});`;

const source = fs.readFileSync(file, 'utf8');

if (source.includes(patched)) {
  console.log('[Aptus] Capacitor Cordova event guard already applied');
  process.exit(0);
}

if (!source.includes(original)) {
  console.error(
    '[Aptus] STOP: Capacitor source changed; Cordova event patch must be reviewed'
  );
  process.exit(1);
}

fs.writeFileSync(file, source.replace(original, patched));

console.log('[Aptus] Applied Capacitor Cordova event guard');
