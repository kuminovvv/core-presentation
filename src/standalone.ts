import { parsePresentation } from "./core/validation";
import { PresentationPlayer } from "./renderer/player";

const source = document.getElementById("presentation-data")?.textContent ?? "";
const project = parsePresentation(source);
const position = document.getElementById("position")!;
const picker = document.getElementById("slide-picker") as HTMLSelectElement;
const notes = document.getElementById("speaker-notes")!;
const readHash = () => {
  const n = Number(location.hash.slice(1));
  return Number.isInteger(n) && n >= 1 && n <= project.slides.length ? n - 1 : 0;
};
const player = new PresentationPlayer(document.getElementById("player")!, project, readHash());
project.slides.forEach((slide, i) => picker.add(new Option((i + 1) + " · " + slide.name, String(i))));
function update(): void {
  position.textContent = (player.currentIndex + 1) + " / " + player.count;
  picker.value = String(player.currentIndex);
  const slide = project.slides[player.currentIndex];
  if (slide) player.element.style.background = slide.background;
  notes.textContent = slide?.notes || "No speaker notes";
  (document.getElementById("previous") as HTMLButtonElement).disabled = player.currentIndex === 0;
  (document.getElementById("next") as HTMLButtonElement).disabled = player.currentIndex === player.count - 1;
  if (location.hash !== "#" + (player.currentIndex + 1)) history.replaceState(null, "", "#" + (player.currentIndex + 1));
}
player.subscribe(update);
update();
const navigate = async (index: number) => { await player.goTo(index); update(); player.focus(); };
picker.addEventListener("change", () => { void navigate(Number(picker.value)); });
window.addEventListener("hashchange", () => { void navigate(readHash()); });
document.getElementById("previous")?.addEventListener("click", () => { void navigate(player.currentIndex - 1); });
document.getElementById("next")?.addEventListener("click", () => { void navigate(player.currentIndex + 1); });
document.getElementById("notes-toggle")?.addEventListener("click", event => {
  notes.hidden = !notes.hidden;
  (event.currentTarget as HTMLElement).setAttribute("aria-expanded", String(!notes.hidden));
});
player.focus();
