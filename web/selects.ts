import "basecoat-css/basecoat";
import "basecoat-css/select";

type BasecoatSelect = HTMLDivElement & { refresh?: () => void };
const controls = new WeakMap<HTMLSelectElement, BasecoatSelect>();
let idCounter = 0;
const chevron = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

function place(root: HTMLElement): void {
  const trigger = root.querySelector("button")!;
  const popup = root.querySelector<HTMLElement>("[data-popover]")!;
  if (trigger.getAttribute("aria-expanded") !== "true") return;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 156), innerWidth - 16);
  const below = innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const up = below < 180 && above > below;
  popup.style.width = width + "px";
  popup.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + "px";
  popup.style.maxHeight = Math.max(60, Math.min(280, up ? above : below)) + "px";
  popup.style.top = up ? "auto" : (rect.bottom + 6) + "px";
  popup.style.bottom = up ? (innerHeight - rect.top + 6) + "px" : "auto";
}
export function syncSelect(native: HTMLSelectElement): void {
  const root = controls.get(native);
  if (!root) return;
  const list = root.querySelector("[role=listbox]")!;
  const input = root.querySelector<HTMLInputElement>('input[type=hidden]')!;
  const signature = JSON.stringify(Array.from(native.options, option => [option.value, option.label, option.disabled]));
  const changed = root.dataset.signature !== signature;
  if (changed) {
    list.replaceChildren(...Array.from(native.options, option => {
      const node = document.createElement("div");
      node.setAttribute("role", "option");
      node.dataset.value = option.value;
      node.textContent = option.label;
      if (option.disabled) node.setAttribute("aria-disabled", "true");
      return node;
    }));
    root.dataset.signature = signature;
  }
  if (!changed && input.value === native.value && root.dataset.selectInitialized) return;
  input.value = native.value;
  for (const option of list.querySelectorAll<HTMLElement>("[role=option]")) {
    if (option.dataset.value === native.value) option.setAttribute("aria-selected", "true");
    else option.removeAttribute("aria-selected");
  }
  root.querySelector("button > span")!.textContent = native.selectedOptions[0]?.label ?? "";
  root.refresh?.();
}
export function enhanceSelects(scope: ParentNode = document): void {
  for (const native of scope.querySelectorAll<HTMLSelectElement>("select")) {
    if (controls.has(native)) continue;
    const shell = document.createElement("div");
    shell.className = "studio-select";
    const root = document.createElement("div") as BasecoatSelect;
    root.className = "select studio-select-component";
    const listId = "studio-listbox-" + (++idCounter);
    const label = native.getAttribute("aria-label") ?? native.closest("label")?.querySelector("span")?.textContent ?? "Выберите значение";
    root.innerHTML = '<button type="button" class="btn" role="combobox" aria-haspopup="listbox" aria-expanded="false"><span></span>' + chevron +
      '</button><div data-popover aria-hidden="true"><div role="listbox"></div></div><input type="hidden">';
    const trigger = root.querySelector("button")!;
    trigger.setAttribute("aria-label", label);
    trigger.setAttribute("aria-controls", listId);
    root.querySelector("[role=listbox]")!.id = listId;
    native.before(shell);
    shell.append(native, root);
    native.classList.add("studio-native-select");
    native.tabIndex = -1;
    native.setAttribute("aria-hidden", "true");
    controls.set(native, root);
    syncSelect(native);
    root.addEventListener("change", event => {
      if (event.target !== root) return;
      const value = (event as CustomEvent<{value: string}>).detail.value;
      if (native.value === value) return;
      native.value = value;
      native.dispatchEvent(new Event("change", { bubbles: true }));
    });
    native.addEventListener("change", () => syncSelect(native));
    new MutationObserver(() => place(root)).observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"] });
    // Do not make the inspector's label activate the hidden native select.
    root.addEventListener("click", event => event.preventDefault());
  }
}
function reposition(): void {
  document.querySelectorAll<HTMLElement>(".studio-select-component").forEach(place);
}
window.addEventListener("resize", reposition);
window.addEventListener("scroll", reposition, true);
