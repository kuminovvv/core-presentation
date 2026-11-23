import { parsePresentation } from "./core/validation";
import { PresentationPlayer } from "./renderer/player";

const source = document.getElementById("presentation-data")?.textContent ?? "";
const project = parsePresentation(source);
const player = new PresentationPlayer(document.getElementById("player")!, project);
const position = document.getElementById("position")!;
function update(): void { position.textContent = `${player.currentIndex + 1} / ${player.count}`; }
player.subscribe(update);
update();
document.getElementById("previous")?.addEventListener("click", () => { void player.previous(); });
document.getElementById("next")?.addEventListener("click", () => { void player.next(); });
player.focus();
