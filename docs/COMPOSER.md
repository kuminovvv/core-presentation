# Composer demo

Independent editable study inspired by Pablo Stanley's [The Life of a Composer](https://composer.pablostanley.com/). Fourteen scenes recreate the basic white-space composition and changing geometry of a rounded input with original explanatory copy. No original site code, images or fonts are copied. It is not a pixel-perfect clone.

From the repository folder (any drive):

```powershell
npm ci
npm run demo:composer
npm start
```

Build first with `npm run build` if needed. Select `composer-demo` in the Studio project picker. The seed command also generates `presentations/composer-demo/presentation.html`; open that file directly, even offline. Re-running the seed does not overwrite an existing project. To get a fresh copy, run `npm run demo:composer -- composer-demo-copy`.

The same native object on different slides has the same `morphId` but different unique element IDs. Set the destination transition to `morph`. The player interpolates native shape geometry, rotation, color, radius, shadows and text size; unmatched or changed content fades. HTML iframe internals are not morphed. Speaker notes are editable per slide. The final scene contains an independent sandboxed form with a local echo, not a real AI service. Use arrow keys or the numbered scene picker in the exported site. The animation honors reduced-motion preferences.

Agent API: pass `morphId`, `fontStyle` or `boxShadow` in element properties, and `transition: {type:"morph", duration:680}` and `notes` in slide tools.
